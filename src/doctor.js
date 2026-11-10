import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { loadConfig } from './config.js';
import { loadApiKey } from './credentials.js';
import { fetchModels, postResponses, upstreamBaseUrl, extractErrorMessage } from './upstream.js';
import { ensureService, stopService, serviceStatus } from './service.js';
import { desktopStatus } from './desktop.js';
import { autostartStatus } from './autostart.js';
import { toolCommand } from './launch.js';
import { maskKey } from './util.js';

function localJson(port, token, requestPath, body = null, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        method: data ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {}),
        },
        timeout,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            /* keep text */
          }
          resolve({ status: res.statusCode, body: parsed, text });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Local request timed out'));
    });
    if (data) req.write(data);
    req.end();
  });
}

function versionOf(command) {
  try {
    // On Windows both CLIs are .cmd shims, which Node cannot spawn directly;
    // toolCommand routes them through cmd.exe.
    const invocation = toolCommand(command, ['--version']);
    return execFileSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    })
      .trim()
      .split(/\r?\n/)[0];
  } catch {
    return null;
  }
}

export async function runDoctor({ json = false, quick = false, logger = null } = {}) {
  const config = loadConfig();
  const { key, source } = loadApiKey();
  const results = [];

  const add = (name, ok, detail, level = null) => {
    results.push({ name, ok, detail, level: level || (ok ? 'ok' : 'fail') });
  };

  add('Node.js', Number(process.versions.node.split('.')[0]) >= 20, `v${process.versions.node}`);

  add(
    'API key',
    Boolean(key),
    key ? `${maskKey(key)} (${source})` : 'missing; run "agentrouter login"',
  );

  let models = [];
  if (key) {
    try {
      models = await fetchModels(key);
      add('Live model list', models.length > 0, `${models.length}: ${models.map((m) => m.id).join(', ')}`);
    } catch (error) {
      add('Live model list', false, error.message);
    }

    try {
      const response = await fetch(`${upstreamBaseUrl()}/v1/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.text();
      if (response.status === 401) {
        add('Client gate', true, 'rejects a plain HTTP client (401), as expected');
      } else if (response.ok) {
        add('Client gate', true, 'plain client is allowed now; no rewrite needed', 'warn');
      } else {
        add('Client gate', false, `unexpected HTTP ${response.status}: ${extractErrorMessage(body)}`);
      }
    } catch (error) {
      add('Client gate', false, `probe failed: ${error.message}`);
    }
  } else {
    add('Live model list', false, 'skipped without a key');
    add('Client gate', false, 'skipped without a key');
  }

  if (!quick && key && models.length > 0) {
    const model = models[0].id;
    try {
      const response = await postResponses(
        key,
        {
          model,
          input: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'Call the ping tool once with value 1.' }],
            },
          ],
          tools: [
            {
              type: 'function',
              name: 'ping',
              description: 'Report a value.',
              parameters: {
                type: 'object',
                properties: { value: { type: 'number' } },
                required: ['value'],
                additionalProperties: false,
              },
              strict: false,
            },
          ],
          tool_choice: 'auto',
          reasoning: { effort: 'low' },
          max_output_tokens: 200,
          store: false,
          stream: false,
        },
        { signal: AbortSignal.timeout(90000) },
      );
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${extractErrorMessage(text)}`);
      const parsed = JSON.parse(text);
      const call = (parsed.output || []).find((item) => item.type === 'function_call');
      add(
        'Tools + reasoning',
        Boolean(call),
        call ? `function_call "${call.name}" with call_id` : 'no function_call in response',
      );
    } catch (error) {
      add('Tools + reasoning', false, error.message);
    }
  }

  if (key) {
    let service = null;
    try {
      service = await ensureService({ config, logger, mode: config.mode === 'full' ? 'full' : 'stable' });
      const token = config.helperToken;
      const called = await localJson(service.port, token, '/v1/messages', {
        model: models[0]?.id || config.lastModel || 'gpt-5.6-sol',
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Reply with exactly OK' }],
        stream: false,
      });
      const textBlock = called.body?.content?.find((block) => block.type === 'text');
      add(
        'Local /v1/messages',
        called.status === 200 && Boolean(textBlock),
        called.status === 200
          ? `HTTP 200, stop_reason=${called.body?.stop_reason}, text=${JSON.stringify((textBlock?.text || '').slice(0, 40))}`
          : `HTTP ${called.status}: ${extractErrorMessage(called.text)}`,
      );

      const counted = await localJson(service.port, token, '/v1/messages/count_tokens', {
        model: models[0]?.id,
        messages: [{ role: 'user', content: 'Hello world' }],
      });
      add(
        'Token counting',
        counted.status === 200 && counted.body?.input_tokens > 0,
        counted.status === 200 ? `${counted.body.input_tokens} estimated tokens` : `HTTP ${counted.status}`,
      );

      const rejected = await localJson(service.port, 'wrong-token', '/v1/messages/count_tokens', {
        messages: [],
      });
      add(
        'Local auth',
        rejected.status === 401,
        rejected.status === 401 ? 'wrong token is rejected' : `unexpected HTTP ${rejected.status}`,
      );
    } catch (error) {
      add('Local /v1/messages', false, error.message);
      add('Token counting', false, 'skipped because the bridge failed');
      add('Local auth', false, 'skipped because the bridge failed');
    } finally {
      if (service?.child) await stopService(service.child);
    }
  }

  const claudeVersion = versionOf('claude');
  const codexVersion = versionOf('codex');
  add('Claude Code', Boolean(claudeVersion), claudeVersion || 'not found in PATH', claudeVersion ? 'ok' : 'warn');
  add('Codex CLI', Boolean(codexVersion), codexVersion || 'not found in PATH', codexVersion ? 'ok' : 'warn');

  const service = await serviceStatus(config);
  add(
    'Background bridge',
    service.running,
    service.running
      ? `running on 127.0.0.1:${service.port} (${service.mode})`
      : 'not running (normal on Android; cc-agent starts it on demand)',
    service.running ? 'ok' : 'warn',
  );

  const desktop = await desktopStatus();
  add(
    'Claude Desktop profile',
    desktop.ours,
    desktop.installed
      ? `${desktop.profile} (appliedId=${desktop.appliedId || 'none'})`
      : `not installed; expected ${desktop.profile}`,
    desktop.installed ? 'ok' : 'warn',
  );

  const autostart = autostartStatus();
  add('Autostart', autostart.enabled, `${autostart.kind}: ${autostart.enabled ? 'enabled' : 'off'}`, autostart.enabled ? 'ok' : 'warn');

  const failed = results.filter((result) => !result.ok && result.level !== 'warn');

  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: failed.length === 0, results }, null, 2)}\n`);
  } else {
    for (const result of results) {
      const symbol = result.level === 'warn' ? '!' : result.ok ? '✓' : '✗';
      process.stdout.write(`${symbol} ${result.name.padEnd(22)} ${result.detail}\n`);
    }
    process.stdout.write(
      `\n${
        failed.length === 0
          ? 'All required checks passed.'
          : `${failed.length} required check(s) failed.`
      }\n`,
    );
  }

  return failed.length === 0 ? 0 : 1;
}
