import { spawn } from 'node:child_process';
import path from 'node:path';
import { codexHome } from './paths.js';
import { ensureDir, writeFileAtomic } from './util.js';

function commandFor(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

export function claudeEnvironment({ port, token, model, contextWindow, mode }) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  env.ANTHROPIC_AUTH_TOKEN = token;
  env.ANTHROPIC_MODEL = model;
  env.ANTHROPIC_SMALL_FAST_MODEL = model;
  env.ANTHROPIC_CUSTOM_MODEL_OPTION = model;
  env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(contextWindow);
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  if (mode === 'stable') env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = '1';
  return env;
}

export function codexConfigText({ model, port }) {
  const quotedModel = JSON.stringify(model);
  return [
    `model = ${quotedModel}`,
    'model_provider = "agentrouter"',
    '',
    '[model_providers.agentrouter]',
    'name = "AgentRouter"',
    `base_url = "http://127.0.0.1:${port}/v1"`,
    'env_key = "AGENTROUTER_LOCAL_TOKEN"',
    'wire_api = "responses"',
    'request_max_retries = 2',
    'stream_max_retries = 2',
    '',
  ].join('\n');
}

export function writeCodexConfig({ model, port }) {
  ensureDir(codexHome);
  const file = path.join(codexHome, 'config.toml');
  writeFileAtomic(file, codexConfigText({ model, port }), 0o600);
  return file;
}

export function codexEnvironment({ port, token, model }) {
  writeCodexConfig({ model, port });
  return {
    ...process.env,
    CODEX_HOME: codexHome,
    AGENTROUTER_LOCAL_TOKEN: token,
  };
}

export function runTool(name, args, env, { cwd = process.cwd() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandFor(name), args, {
      stdio: 'inherit',
      env,
      cwd,
      windowsHide: false,
    });

    const forward = (signal) => {
      try {
        child.kill(signal);
      } catch {
        /* ignore */
      }
    };
    const onSigint = () => forward('SIGINT');
    const onSigterm = () => forward('SIGTERM');
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);

    child.once('error', (error) => {
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
      if (error.code === 'ENOENT') {
        reject(
          new Error(
            `"${name}" was not found in PATH. Install it first and try again.`,
          ),
        );
        return;
      }
      reject(error);
    });

    child.once('exit', (code, signal) => {
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
      resolve(code ?? (signal ? 128 : 1));
    });
  });
}
