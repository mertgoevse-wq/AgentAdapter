import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { codexHome } from './paths.js';
import { ensureDir, writeFileAtomic } from './util.js';

const WINDOWS_DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

const INSTALL_HINT = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
};

/**
 * npm, the Claude Code native installer and Codex all place their shims in
 * directories that are not always on PATH in a fresh Windows shell.
 */
export function windowsSearchDirs(env = process.env) {
  const dirs = [];
  if (env.USERPROFILE) dirs.push(path.win32.join(env.USERPROFILE, '.local', 'bin'));
  if (env.APPDATA) dirs.push(path.win32.join(env.APPDATA, 'npm'));
  if (env.LOCALAPPDATA) dirs.push(path.win32.join(env.LOCALAPPDATA, 'Programs', 'claude'));
  return dirs;
}

export function isWindowsBatchFile(file) {
  return /\.(cmd|bat)$/i.test(String(file || ''));
}

/**
 * Resolves a bare command name the way cmd.exe would: PATH directories first,
 * then well-known shim directories, and PATHEXT in order (.EXE before .CMD).
 */
export function findExecutable(name, { env = process.env, exists = fs.existsSync } = {}) {
  if (!name) return null;
  const hasExtension = /\.[A-Za-z0-9]+$/.test(name);
  const extensions = hasExtension
    ? ['']
    : String(env.PATHEXT || WINDOWS_DEFAULT_PATHEXT)
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean);

  const dirs = [];
  const seen = new Set();
  for (const raw of [...String(env.PATH || '').split(';'), ...windowsSearchDirs(env)]) {
    const dir = raw.trim().replace(/^"(.*)"$/, '$1');
    if (!dir) continue;
    const key = dir.toLowerCase().replace(/\\+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    dirs.push(dir);
  }

  for (const dir of dirs) {
    for (const extension of extensions) {
      const file = hasExtension ? name : `${name}${extension.toLowerCase()}`;
      const candidate = path.win32.join(dir, file);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Quotes one argument for a batch file invoked through cmd.exe.
 * Backslashes before a quote (and at the end) are doubled so the closing
 * quote survives. See https://qntm.org/cmd for the rules.
 */
export function quoteCmdArgument(value) {
  let arg = String(value ?? '');
  arg = arg.replace(/(\\*)"/g, (_, slashes) => `${slashes}${slashes}\\"`);
  arg = arg.replace(/\\+$/, (slashes) => slashes + slashes);
  return `"${arg}"`;
}

/**
 * cmd /d /s /c strips the first and last quote of the command line, so the
 * whole line gets one extra pair around it.
 */
export function buildCmdLine(file, args = []) {
  const line = [quoteCmdArgument(file), ...args.map(quoteCmdArgument)].join(' ');
  return `"${line}"`;
}

/**
 * Node refuses to spawn .bat/.cmd files directly since Node 20.12
 * (CVE-2024-27980, spawn EINVAL). npm installs Claude Code and Codex as .cmd
 * shims on Windows, so route those through cmd.exe explicitly.
 */
export function toolCommand(
  name,
  args = [],
  { platform = process.platform, env = process.env, exists = fs.existsSync } = {},
) {
  if (platform !== 'win32') return { command: name, args, resolved: name, viaCmd: false };

  // An explicit path is used as given; only bare names are looked up.
  const resolved = /[\\/]/.test(name) ? path.resolve(name) : findExecutable(name, { env, exists }) || name;
  if (!isWindowsBatchFile(resolved)) {
    return { command: resolved, args, resolved, viaCmd: false };
  }

  const comspec = env.ComSpec || env.COMSPEC || 'cmd.exe';
  return {
    command: comspec,
    args: ['/d', '/s', '/c', buildCmdLine(resolved, args)],
    windowsVerbatimArguments: true,
    resolved,
    viaCmd: true,
  };
}

function missingToolMessage(name, { platform }) {
  const hint = INSTALL_HINT[name];
  const lines = [`"${name}" was not found in PATH. Install it first and try again.`];
  if (hint) lines.push(`  ${hint}`);
  if (platform === 'win32') {
    lines.push('Then open a new terminal so the PATH change is visible.');
  }
  return lines.join('\n');
}

export function claudeEnvironment(
  { port, token, model, contextWindow, mode },
  { baseEnv = process.env } = {},
) {
  const env = { ...baseEnv };

  // A stale key, OAuth session or Bedrock/Vertex switch would win over the
  // local bridge; all four are removed for this child process only.
  for (const name of [
    'ANTHROPIC_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_PROFILE',
    'ANTHROPIC_BEDROCK_BASE_URL',
    'ANTHROPIC_VERTEX_BASE_URL',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
  ]) {
    delete env[name];
  }

  env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  env.ANTHROPIC_AUTH_TOKEN = token;
  env.ANTHROPIC_MODEL = model;
  // Claude Code sends its built-in Claude IDs for aliases and background
  // tasks. Pin every alias to the selected AgentRouter model, otherwise those
  // requests fail with "unrecognized model".
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
  env.ANTHROPIC_SMALL_FAST_MODEL = model; // deprecated, kept for older CLIs
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

export function runTool(
  name,
  args,
  env,
  { cwd = process.cwd(), platform = process.platform, exists = fs.existsSync } = {},
) {
  return new Promise((resolve, reject) => {
    const invocation = toolCommand(name, args, { platform, env, exists });
    const child = spawn(invocation.command, invocation.args, {
      stdio: 'inherit',
      env,
      cwd,
      windowsHide: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });

    // On Windows the console delivers Ctrl+C to every attached process, so the
    // handler only keeps this process alive until the child exits; that lets the
    // bridge be stopped in the caller's finally block.
    const forward = (signal) => {
      if (platform === 'win32') return;
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

    const cleanup = () => {
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
    };

    child.once('error', (error) => {
      cleanup();
      if (error.code === 'ENOENT') {
        reject(new Error(missingToolMessage(name, { platform })));
        return;
      }
      if (error.code === 'EINVAL' && platform === 'win32') {
        reject(
          new Error(
            `"${name}" could not be started (spawn EINVAL).\n` +
              'Node cannot run a .cmd shim directly; AgentAdapter normally routes it through cmd.exe.\n' +
              `Resolved command: ${invocation.resolved}`,
          ),
        );
        return;
      }
      reject(error);
    });

    child.once('exit', (code, signal) => {
      cleanup();
      resolve(code ?? (signal ? 128 : 1));
    });
  });
}
