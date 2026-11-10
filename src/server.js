import http from 'node:http';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import {
  postResponses,
  fetchModels,
  authFailureHint,
  extractErrorMessage,
  toAnthropicError,
} from './upstream.js';
import {
  toResponsesRequest,
  fromResponsesJson,
  estimateTokens,
  ResponsesStreamTranslator,
} from './translate.js';

const BODY_LIMIT = 25 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10 * 60 * 1000;

function sendJson(res, status, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createBridgeServer({
  apiKey,
  token,
  mode = 'stable',
  logger,
  fetchImpl = fetch,
  version = '0.2.0',
}) {
  const modelCache = { at: 0, list: null };
  const inFlight = new Set();

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      logger?.error('request.unhandled', { error: error.message });
      if (!res.headersSent) {
        sendJson(res, error.status || 500, toAnthropicError(error.status || 500, error.message));
      } else {
        res.end();
      }
    });
  });

  server.on('close', () => {
    for (const controller of inFlight) controller.abort();
    inFlight.clear();
  });

  function authorized(req) {
    const header = req.headers.authorization || '';
    const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    const apiKeyHeader = Array.isArray(req.headers['x-api-key'])
      ? req.headers['x-api-key'][0]
      : req.headers['x-api-key'];
    return safeEqual(bearer || apiKeyHeader || '', token);
  }

  async function models() {
    if (modelCache.list && Date.now() - modelCache.at < 60_000) return modelCache.list;
    const list = await fetchModels(apiKey, { fetchImpl, timeoutMs: 20000 });
    modelCache.list = list;
    modelCache.at = Date.now();
    return list;
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/healthz') {
      return sendJson(res, 200, {
        ok: true,
        service: 'agent-adapter',
        version,
        mode,
        pid: process.pid,
      });
    }

    if (!authorized(req)) {
      return sendJson(
        res,
        401,
        toAnthropicError(401, 'Invalid or missing local AgentAdapter token.', 'authentication_error'),
      );
    }

    if (path === '/v1/models' && req.method === 'GET') {
      const list = await models();
      return sendJson(res, 200, {
        object: 'list',
        data: list.map((model) => ({
          id: model.id,
          object: 'model',
          created: 0,
          owned_by: model.ownedBy || 'agentrouter',
          display_name: model.displayName || model.id,
          supported_endpoint_types: model.endpointTypes || ['openai'],
        })),
      });
    }

    if (path === '/v1/messages' && req.method === 'POST') {
      return handleMessages(req, res);
    }

    if (path === '/v1/messages/count_tokens' && req.method === 'POST') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, toAnthropicError(400, 'Invalid JSON body.', 'invalid_request_error'));
      }
      return sendJson(res, 200, { input_tokens: estimateTokens(body) });
    }

    if (path === '/v1/responses' && req.method === 'POST') {
      return handleResponses(req, res);
    }

    return sendJson(res, 404, toAnthropicError(404, `No route for ${req.method} ${path}.`, 'not_found_error'));
  }

  async function handleMessages(req, res) {
    const started = Date.now();
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, toAnthropicError(400, 'Invalid JSON body.', 'invalid_request_error'));
    }

    if (!body?.model || !Array.isArray(body?.messages)) {
      return sendJson(
        res,
        400,
        toAnthropicError(400, 'The request needs "model" and "messages".', 'invalid_request_error'),
      );
    }

    let payload;
    try {
      payload = toResponsesRequest(body, { mode });
    } catch (error) {
      return sendJson(res, 400, toAnthropicError(400, error.message, 'invalid_request_error'));
    }

    const controller = new AbortController();
    inFlight.add(controller);
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    const finish = () => {
      clearTimeout(timeout);
      inFlight.delete(controller);
    };

    logger?.info('messages.request', {
      model: body.model,
      stream: Boolean(body.stream),
      tools: Array.isArray(body.tools) ? body.tools.length : 0,
      messages: body.messages.length,
      mode,
      bytes: raw.length,
    });

    let upstream;
    try {
      upstream = await postResponses(apiKey, payload, {
        signal: controller.signal,
        fetchImpl,
      });
    } catch (error) {
      finish();
      const message =
        error.name === 'AbortError'
          ? 'The request timed out or the client disconnected.'
          : `Cannot reach AgentRouter: ${error.message}`;
      logger?.error('messages.upstream_failed', { error: message });
      return sendJson(res, 502, toAnthropicError(502, message, 'api_error'));
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      finish();
      const message = authFailureHint(upstream.status, extractErrorMessage(text));
      logger?.warn('messages.upstream_error', {
        status: upstream.status,
        error: message,
        body: text.slice(0, 500),
        ms: Date.now() - started,
      });
      return sendJson(res, upstream.status, toAnthropicError(upstream.status, message));
    }

    if (body.stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const translator = new ResponsesStreamTranslator({
        res,
        model: body.model,
        onDone: (meta) => {
          finish();
          logger?.info('messages.stream_done', {
            model: body.model,
            ms: Date.now() - started,
            ...meta,
          });
        },
      });
      translator.begin();
      const keepAlive = setInterval(() => translator.ping(), 15000);

      try {
        await consumeSse(upstream.body, translator);
      } catch (error) {
        logger?.warn('messages.stream_aborted', { error: error.message });
        translator.fail(error.message);
      } finally {
        clearInterval(keepAlive);
        translator.endIfNeeded();
        finish();
        res.end();
      }
      return;
    }

    let parsed;
    try {
      parsed = await upstream.json();
    } catch (error) {
      finish();
      return sendJson(res, 502, toAnthropicError(502, `Invalid AgentRouter response: ${error.message}`));
    }

    const message = fromResponsesJson(parsed, { model: body.model });
    finish();
    logger?.info('messages.done', {
      model: body.model,
      ms: Date.now() - started,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      stopReason: message.stop_reason,
    });
    return sendJson(res, 200, message);
  }

  async function handleResponses(req, res) {
    const started = Date.now();
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: { message: 'Invalid JSON body.', type: 'invalid_request_error' } });
    }

    logger?.info('responses.request', {
      model: body?.model,
      stream: Boolean(body?.stream),
      tools: Array.isArray(body?.tools) ? body.tools.length : 0,
      bytes: raw.length,
    });

    const controller = new AbortController();
    inFlight.add(controller);
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    let upstream;
    try {
      upstream = await postResponses(apiKey, body, {
        signal: controller.signal,
        fetchImpl,
      });
    } catch (error) {
      clearTimeout(timeout);
      inFlight.delete(controller);
      logger?.error('responses.upstream_failed', { error: error.message });
      return sendJson(res, 502, {
        error: { message: `Cannot reach AgentRouter: ${error.message}`, type: 'api_error' },
      });
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      clearTimeout(timeout);
      inFlight.delete(controller);
      logger?.warn('responses.upstream_error', {
        status: upstream.status,
        body: text.slice(0, 500),
        ms: Date.now() - started,
      });
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      });
      res.end(text);
      return;
    }

    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    try {
      if (upstream.body) {
        await pipelineWeb(upstream.body, res);
      } else {
        res.end();
      }
    } catch (error) {
      logger?.warn('responses.stream_aborted', { error: error.message });
    } finally {
      clearTimeout(timeout);
      inFlight.delete(controller);
      logger?.info('responses.done', { model: body?.model, ms: Date.now() - started });
      if (!res.writableEnded) res.end();
    }
  }

  return server;
}

async function consumeSse(stream, translator) {
  if (!stream) return;
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        translator.handle(JSON.parse(data));
      } catch (error) {
        translator.fail(`Cannot parse AgentRouter stream event: ${error.message}`);
        return;
      }
    }
  }
  buffer += decoder.decode();
  if (buffer.startsWith('data:')) {
    const data = buffer.slice(5).trim();
    if (data && data !== '[DONE]') {
      try {
        translator.handle(JSON.parse(data));
      } catch {
        /* ignore trailing fragment */
      }
    }
  }
}

async function pipelineWeb(stream, res) {
  const readable = Readable.fromWeb(stream);
  for await (const chunk of readable) {
    if (res.writableEnded) break;
    if (!res.write(chunk)) {
      await new Promise((resolve) => res.once('drain', resolve));
    }
  }
}
