import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const isWindows = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isTermux =
  Boolean(process.env.TERMUX_VERSION) ||
  fs.existsSync('/data/data/com.termux/files/usr');

export const homeDir = os.homedir();
export const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function envDir(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? path.resolve(value) : fallback;
}

export const configDir = envDir(
  'AGENTROUTER_CONFIG_DIR',
  isWindows
    ? path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'agentrouter')
    : path.join(process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'), 'agentrouter'),
);

export const dataDir = envDir(
  'AGENTROUTER_DATA_DIR',
  isWindows
    ? path.join(process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 'agentrouter')
    : path.join(process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share'), 'agentrouter'),
);

export const credentialsPath = path.join(configDir, 'credentials.json');
export const configPath = path.join(configDir, 'config.json');
export const changesPath = path.join(configDir, 'changes.json');
export const installPath = path.join(configDir, 'install.json');
export const pidPath = path.join(configDir, 'agentrouter.pid');
export const modelsCachePath = path.join(configDir, 'models-cache.json');
export const logDir = path.join(configDir, 'logs');
export const logFile = path.join(logDir, 'agentrouter.log');
export const serviceLogFile = path.join(logDir, 'service.log');
export const backupsDir = path.join(configDir, 'backups');
export const codexHome = path.join(dataDir, 'codex');

export function claude3pRoot() {
  if (process.env.AGENTROUTER_CLAUDE3P_DIR) {
    return path.resolve(process.env.AGENTROUTER_CLAUDE3P_DIR);
  }
  if (isWindows) {
    return path.join(process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 'Claude-3p');
  }
  if (isMac) {
    return path.join(homeDir, 'Library', 'Application Support', 'Claude-3p');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'), 'Claude-3p');
}

export function claude3pConfigLibrary() {
  return path.join(claude3pRoot(), 'configLibrary');
}

export function binPath(name) {
  return path.join(appRoot, 'bin', name);
}
