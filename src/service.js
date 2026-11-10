import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  binPath,
  configDir,
  logDir,
  pidPath,
  serviceLogFile,
} from './paths.js';
import { ensureDir, findFreePort, isProcessAlive, readJson, sleep, writeJsonAtomic } from './util.js';
import { saveConfig } from './config.js';

export function checkHealth(port, { timeout = 800, host = '127.0.0.1' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const req = http.get({ host, port, path: '/healthz', timeout }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          done({ ok: res.statusCode === 200 && parsed.ok === true, ...parsed });
        } catch {
          done({ ok: false });
        }
      });
    });
    req.on('error', () => done({ ok: false }));
    req.on('timeout', () => {
      req.destroy();
      done({ ok: false });
    });
  });
}

export async function waitForHealth(port, { child = null, timeoutMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) return { ok: false, exitCode: child.exitCode };
    const health = await checkHealth(port, { timeout: 600 });
    if (health.ok) return health;
    await sleep(250);
  }
  return { ok: false, timeout: true };
}

export async function ensureService({ config, logger, mode, port: requestedPort = null }) {
  const existing = await checkHealth(config.port);
  if (existing.ok && existing.mode === mode) {
    return { port: config.port, child: null, reused: true, mode: existing.mode || mode };
  }

  const port = requestedPort || (await findFreePort(config.port));
  const stderr = [];
  const child = spawn(
    process.execPath,
    [binPath('agentrouter.js'), 'serve', '--foreground', '--port', String(port)],
    {
      env: {
        ...process.env,
        AGENTROUTER_CONFIG_DIR: configDir,
        AGENTROUTER_MODE: mode,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    },
  );

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    const text = String(chunk);
    stderr.push(text);
    if (stderr.join('').length > 8000) stderr.shift();
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      logger?.debug('service.stderr', { line });
    }
  });

  const health = await waitForHealth(port, { child, timeoutMs: 20000 });
  if (!health.ok) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    const tail = stderr.join('').trim().split(/\r?\n/).slice(-6).join('\n');
    throw new Error(
      `The local bridge did not become ready on port ${port}.${tail ? `\n${tail}` : ''}`,
    );
  }

  logger?.info('service.started', { port, pid: child.pid, mode });
  return { port, child, reused: false, mode: health.mode || mode };
}

export async function stopService(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      resolve();
    }, 4000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

export function readPidFile() {
  const value = readJson(pidPath, null);
  if (!value || !value.pid) return null;
  return value;
}

export async function startDaemon({ config, logger, mode }) {
  const health = await checkHealth(config.port);
  if (health.ok && health.mode === mode) {
    return { port: config.port, started: false, pid: health.pid || null };
  }

  const port = health.ok ? await findFreePort(config.port + 1) : await findFreePort(config.port);
  ensureDir(logDir);
  const logFd = fs.openSync(serviceLogFile, 'a', 0o600);
  const child = spawn(
    process.execPath,
    [binPath('agentrouter.js'), 'serve', '--foreground', '--port', String(port)],
    {
      env: {
        ...process.env,
        AGENTROUTER_CONFIG_DIR: configDir,
        AGENTROUTER_MODE: mode,
      },
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    },
  );
  child.unref();
  fs.closeSync(logFd);

  writeJsonAtomic(pidPath, {
    pid: child.pid,
    port,
    mode,
    startedAt: new Date().toISOString(),
  });

  const ready = await waitForHealth(port, { timeoutMs: 20000 });
  if (!ready.ok) {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
    throw new Error(`The background bridge did not start on port ${port}. See ${serviceLogFile}.`);
  }

  config.port = port;
  saveConfig(config);
  logger?.info('service.daemon_started', { port, pid: child.pid, mode });
  return { port, started: true, pid: child.pid };
}

export async function stopDaemon() {
  const info = readPidFile();
  if (!info) return { stopped: false, reason: 'no pid file' };
  if (!isProcessAlive(info.pid)) {
    try {
      fs.unlinkSync(pidPath);
    } catch {
      /* ignore */
    }
    return { stopped: false, reason: 'stale pid file removed' };
  }

  try {
    process.kill(info.pid, 'SIGTERM');
  } catch (error) {
    return { stopped: false, reason: error.message };
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!isProcessAlive(info.pid)) break;
    await sleep(200);
  }
  if (isProcessAlive(info.pid)) {
    try {
      process.kill(info.pid, 'SIGKILL');
    } catch {
      /* ignore */
    }
  }
  try {
    fs.unlinkSync(pidPath);
  } catch {
    /* ignore */
  }
  return { stopped: true, pid: info.pid };
}

export async function serviceStatus(config) {
  const health = await checkHealth(config.port);
  const pid = readPidFile();
  return {
    running: health.ok,
    port: config.port,
    mode: health.mode || null,
    pid: health.pid || pid?.pid || null,
    health,
  };
}

export function servicePaths() {
  return {
    pidPath,
    logFile: serviceLogFile,
    entry: path.join(logDir, 'service.log'),
  };
}
