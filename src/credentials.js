import { credentialsPath } from './paths.js';
import { ensureDir, readJson, writeJsonAtomic } from './util.js';

export function loadApiKey() {
  const fromEnv = (process.env.AGENTROUTER_API_KEY || '').trim();
  if (fromEnv) return { key: fromEnv, source: 'environment' };

  const stored = readJson(credentialsPath, null);
  if (stored && typeof stored.apiKey === 'string' && stored.apiKey.trim()) {
    return { key: stored.apiKey.trim(), source: 'file' };
  }
  return { key: null, source: 'none' };
}

export function saveApiKey(key, baseUrl = 'https://agentrouter.org') {
  ensureDir(credentialsPath.replace(/[\\/][^\\/]+$/, ''));
  writeJsonAtomic(
    credentialsPath,
    {
      version: 1,
      apiKey: key.trim(),
      baseUrl,
      createdAt: new Date().toISOString(),
    },
    0o600,
  );
}

export function isValidKeyShape(key) {
  return typeof key === 'string' && /^sk-[A-Za-z0-9_-]{16,}$/.test(key.trim());
}

export async function promptHidden(question) {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0].trim();
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let buffer = '';
    stdout.write(question);

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(buffer.trim());
          return;
        }
        if (char === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          buffer = buffer.slice(0, -1);
          continue;
        }
        if (char === '\u001b') continue;
        buffer += char;
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}
