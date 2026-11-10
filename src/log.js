import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from './util.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***'],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1***'],
  [/(x-api-key["':\s]+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1***'],
];

export function redact(value) {
  let text = String(value ?? '');
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function redactObject(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redact(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactObject);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/key|token|authorization|secret|password/i.test(key)) {
      out[key] = item ? '***' : item;
    } else {
      out[key] = redactObject(item);
    }
  }
  return out;
}

function rotate(file, maxBytes = 5 * 1024 * 1024, keep = 3) {
  try {
    const stat = fs.statSync(file);
    if (stat.size < maxBytes) return;
  } catch {
    return;
  }
  for (let index = keep - 1; index >= 1; index -= 1) {
    const from = index === 1 ? file : `${file}.${index - 1}`;
    const to = `${file}.${index}`;
    try {
      fs.renameSync(from, to);
    } catch {
      /* ignore missing file */
    }
  }
}

export function createLogger({
  level = 'info',
  file = null,
  console: useConsole = true,
  context = {},
} = {}) {
  let stream = null;
  if (file) {
    ensureDir(path.dirname(file));
    rotate(file);
    stream = fs.createWriteStream(file, { flags: 'a', mode: 0o600 });
  }

  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(lvl, message, extra = {}) {
    if ((LEVELS[lvl] ?? 0) < threshold) return;
    const record = {
      ts: new Date().toISOString(),
      level: lvl,
      msg: redact(message),
      ...context,
      ...redactObject(extra),
    };
    if (stream) stream.write(`${JSON.stringify(record)}\n`);
    if (useConsole) {
      const details = Object.entries(redactObject(extra))
        .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .join(' ');
      const suffix = details ? ` ${details}` : '';
      process.stderr.write(`[agentrouter] ${lvl} ${redact(message)}${suffix}\n`);
    }
  }

  return {
    debug: (message, extra) => write('debug', message, extra),
    info: (message, extra) => write('info', message, extra),
    warn: (message, extra) => write('warn', message, extra),
    error: (message, extra) => write('error', message, extra),
    child(extraContext) {
      return createLogger({ level, file, console: useConsole, context: { ...context, ...extraContext } });
    },
    close() {
      if (stream) stream.end();
    },
  };
}

export function logFilePath() {
  return null;
}
