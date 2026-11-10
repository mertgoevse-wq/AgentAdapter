import fs from 'node:fs';
import path from 'node:path';
import {
  backupsDir,
  claude3pConfigLibrary,
  claude3pRoot,
} from './paths.js';
import {
  ensureDir,
  readJson,
  timestampForPath,
  writeJsonAtomic,
} from './util.js';
import { loadChanges, saveChanges, ensureId } from './state.js';
import { startDaemon, stopDaemon } from './service.js';

export const PROFILE_ID = '6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42';

function profilePath() {
  return path.join(claude3pConfigLibrary(), `${PROFILE_ID}.json`);
}

function metaPath() {
  return path.join(claude3pConfigLibrary(), '_meta.json');
}

export function desktopEntry({ port, models, token }) {
  return {
    inferenceProvider: 'gateway',
    inferenceCredentialKind: 'static',
    inferenceGatewayBaseUrl: `http://127.0.0.1:${port}`,
    inferenceGatewayApiKey: token,
    inferenceGatewayAuthScheme: 'bearer',
    inferenceModels: models.map((model) => ({ name: model.id })),
    inferenceStreamIdleTimeoutSec: 600,
  };
}

export function desktopPaths() {
  return {
    root: claude3pRoot(),
    configLibrary: claude3pConfigLibrary(),
    profile: profilePath(),
    meta: metaPath(),
  };
}

export async function desktopStatus() {
  const paths = desktopPaths();
  const meta = readJson(paths.meta, null);
  const profile = readJson(paths.profile, null);
  return {
    ...paths,
    installed: Boolean(profile),
    appliedId: meta?.appliedId || null,
    ours: meta?.appliedId === PROFILE_ID,
    models: Array.isArray(profile?.inferenceModels)
      ? profile.inferenceModels.map((entry) => (typeof entry === 'string' ? entry : entry?.name)).filter(Boolean)
      : [],
  };
}

export async function desktopOn({ config, models, logger, restart = false }) {
  const paths = desktopPaths();
  if (!fs.existsSync(claude3pRoot())) {
    throw new Error(
      `Claude Desktop's third-party folder was not found at ${claude3pRoot()}.\n` +
        'Install Claude Desktop, enable Developer mode once, then run this command again.',
    );
  }
  ensureDir(paths.configLibrary);

  const daemon = await startDaemon({ config, logger, mode: config.mode });

  const backupDir = path.join(backupsDir, `desktop-${timestampForPath()}`);
  ensureDir(backupDir);
  let metaBackup = null;
  let previousMeta = null;

  if (fs.existsSync(paths.meta)) {
    previousMeta = readJson(paths.meta, null);
    metaBackup = path.join(backupDir, '_meta.json');
    fs.copyFileSync(paths.meta, metaBackup);
    try {
      fs.chmodSync(metaBackup, 0o600);
    } catch {
      /* ignore */
    }
  }

  writeJsonAtomic(
    paths.profile,
    desktopEntry({ port: daemon.port, models, token: config.helperToken }),
    0o600,
  );

  const meta = previousMeta && typeof previousMeta === 'object' ? { ...previousMeta } : {};
  meta.appliedId = PROFILE_ID;
  writeJsonAtomic(paths.meta, meta, 0o600);

  const changes = loadChanges().filter((entry) => entry.type !== 'desktop');
  const change = ensureId({
    type: 'desktop',
    profileId: PROFILE_ID,
    profilePath: paths.profile,
    metaPath: paths.meta,
    metaBackup,
    previousAppliedId: previousMeta?.appliedId ?? null,
    port: daemon.port,
  });
  changes.push(change);
  saveChanges(changes);

  if (restart && process.platform === 'win32') {
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('taskkill', ['/IM', 'Claude.exe', '/F'], { stdio: 'ignore' });
      execFileSync('cmd', ['/c', 'start', '', 'claude'], { stdio: 'ignore' });
    } catch {
      logger?.warn('desktop.restart_failed', { hint: 'Restart Claude Desktop manually.' });
    }
  }

  return {
    ...paths,
    port: daemon.port,
    started: daemon.started,
    backupDir,
    restartRequired: !restart,
  };
}

export async function desktopOff({ config = null, logger } = {}) {
  const changes = loadChanges();
  const change = [...changes].reverse().find((entry) => entry.type === 'desktop');
  const paths = desktopPaths();
  const result = { removedProfile: false, restoredMeta: false, previousAppliedId: null };

  if (fs.existsSync(paths.profile)) {
    fs.unlinkSync(paths.profile);
    result.removedProfile = true;
  }

  if (change?.metaBackup && fs.existsSync(change.metaBackup)) {
    fs.copyFileSync(change.metaBackup, paths.meta);
    result.restoredMeta = true;
    result.previousAppliedId = change.previousAppliedId ?? null;
  } else if (fs.existsSync(paths.meta)) {
    const meta = readJson(paths.meta, {});
    if (meta && meta.appliedId === PROFILE_ID) {
      if (change?.previousAppliedId) meta.appliedId = change.previousAppliedId;
      else delete meta.appliedId;
      writeJsonAtomic(paths.meta, meta, 0o600);
      result.restoredMeta = true;
      result.previousAppliedId = change?.previousAppliedId ?? null;
    }
  }

  saveChanges(changes.filter((entry) => entry.id !== change?.id));

  try {
    await stopDaemon();
  } catch (error) {
    logger?.warn('desktop.daemon_stop_failed', { error: error.message });
  }

  return result;
}

export async function desktopRestartPrompt() {
  return [
    'Claude Desktop reads this profile only at startup.',
    'Quit Claude Desktop completely (including the tray icon) and open it again.',
    'If the model picker is empty, check Developer → Configure Third-Party Inference.',
  ].join('\n');
}
