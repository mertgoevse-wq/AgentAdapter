import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeServer } from '../src/server.js';

const TOKEN = 'local-test-token';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(events) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const fakeFetch = async (url, init = {}) => {
  if (String(url).endsWith('/v1/models')) {
    return jsonResponse({
      data: [
        { id: 'gpt-5.6-sol', supported_endpoint_types: ['openai'] },
        { id: 'claude-opus-4-8', supported_endpoint_types: ['anthropic'] },
      ],
    });
  }

  const body = JSON.parse(init.body || '{}');
  if (String(url).endsWith('/v1/responses')) {
    if (body.stream) {
      return sseResponse([
        { type: 'response.created', response: { id: 'resp_1' } },
        { type: 'response.output_item.added', item: { type: 'message' } },
        { type: 'response.output_text.delta', delta: 'OK' },
        { type: 'response.output_item.done', item: { type: 'message' } },
        {
          type: 'response.completed',
          response: { status: 'completed', usage: { input_tokens: 3, output_tokens: 1 } },
        },
      ]);
    }
    return jsonResponse({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }],
      usage: { input_tokens: 3, output_tokens: 1 },
    });
  }

  return jsonResponse({ error: { message: 'not found' } }, 404);
};

async function withServer(run) {
  const server = createBridgeServer({
    apiKey: 'sk-test',
    token: TOKEN,
    mode: 'stable',
    fetchImpl: fakeFetch,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('health endpoint is public, everything else requires the local token', async () => {
  await withServer(async (port) => {
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, 'agent-adapter');

    const denied = await fetch(`http://127.0.0.1:${port}/v1/models`);
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).type, 'error');
  });
});

test('non-streaming messages return Anthropic shape and filter models', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.6-sol',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'Say OK' }],
      }),
    });

    assert.equal(response.status, 200);
    const message = await response.json();
    assert.equal(message.type, 'message');
    assert.equal(message.content[0].text, 'OK');
    assert.equal(message.stop_reason, 'end_turn');
    assert.equal(message.usage.input_tokens, 3);

    const models = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const payload = await models.json();
    assert.deepEqual(payload.data.map((model) => model.id), ['gpt-5.6-sol']);
  });
});

test('streaming messages produce Anthropic events', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.6-sol',
        max_tokens: 64,
        stream: true,
        messages: [{ role: 'user', content: 'Say OK' }],
      }),
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const text = await response.text();
    assert.match(text, /event: message_start/);
    assert.match(text, /"text_delta","text":"OK"/);
    assert.match(text, /event: message_stop/);
  });
});

test('count_tokens is local and never returns 404', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.6-sol',
        messages: [{ role: 'user', content: 'Hello world' }],
      }),
    });
    assert.equal(response.status, 200);
    assert.ok((await response.json()).input_tokens > 0);
  });
});

test('invalid JSON and missing fields are rejected with Anthropic errors', async () => {
  await withServer(async (port) => {
    const bad = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: '{not json',
    });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.type, 'invalid_request_error');

    const missing = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.6-sol' }),
    });
    assert.equal(missing.status, 400);
  });
});
