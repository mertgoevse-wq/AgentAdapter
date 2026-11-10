import { configPath, credentialsPath, logFile, modelsCachePath } from './paths.js';
import { ensureDir, randomToken, readJson, writeJsonAtomic } from './util.js';

export const DESKTOP_PROFILE_ID = '6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42';

const DEFAULTS = {
  version: 1,
  port: 8787,
  mode: 'stable',
  contextWindow: 200000,
  helperToken: null,
  desktopProfileId: DESKTOP_PROFILE_ID,
  logLevel: 'info',
};

export function loadConfig() {
  const stored = readJson(configPath, {});
  const config = { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) };

  if (process.env.AGENTROUTER_MODE === 'full' || process.env.AGENTROUTER_MODE === 'stable') {
    config.mode = process.env.AGENTROUTER_MODE;
  }
  if (process.env.AGENTROUTER_PORT) {
    const port = Number(process.env.AGENTROUTER_PORT);
    if (Number.isInteger(port) && port > 0 && port < 65536) config.port = port;
  }
  if (process.env.AGENTROUTER_CONTEXT_WINDOW) {
    const window = Number(process.env.AGENTROUTER_CONTEXT_WINDOW);
    if (Number.isInteger(window) && window >= 16000) config.contextWindow = window;
  }

  if (!config.helperToken || typeof config.helperToken !== 'string') {
    config.helperToken = randomToken();
    saveConfig(config);
  }

  return config;
}

export function saveConfig(config) {
  ensureDir(configPath.replace(/[\\/][^\\/]+$/, ''));
  writeJsonAtomic(configPath, config, 0o600);
}

export function resolveMode(config, forcedFull = false) {
  if (forcedFull) return 'full';
  return config.mode === 'full' ? 'full' : 'stable';
}

export function logFileForConfig() {
  return logFile;
}

export function apiKeyPath() {
  return credentialsPath;
}

export function modelsCachePathForConfig() {
  return modelsCachePath;
}
