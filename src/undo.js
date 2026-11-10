import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  configDir,
  dataDir,
  homeDir,
  installPath,
  isWindows,
} from './paths.js';
import { readJson } from './util.js';
import { loadChanges, saveChanges } from './state.js';
import { desktopOff } from './desktop.js';
import { autostartOff } from './autostart.js';
import { stopDaemon } from './service.js';

function removeIfOurs(link, installDir) {
  try {
    const stat = fs.lstatSync(link);
    if (!stat.isSymbolicLink()) return false;
    const target = fs.realpathSync(link);
    if (!target.startsWith(installDir)) return false;
    fs.unlinkSync(link);
    return true;
  } catch {
    return false;
  }
}

function removeProfileBlock() {
  const file = path.join(homeDir, '.profile');
  try {
    const text = fs.readFileSync(file, 'utf8');
    const cleaned = text.replace(
      /\n?# >>> agent-adapter install >>>[\s\S]*?# <<< agent-adapter install <<<\n?/g,
      '\n',
    );
    if (cleaned !== text) {
      fs.writeFileSync(file, cleaned, { mode: 0o600 });
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function removeWindowsPath(installDir) {
  if (!isWindows) return false;
  const script = [
    '$dir = $args[0]',
    '$current = [Environment]::GetEnvironmentVariable("Path", "User")',
    '$parts = $current -split ";" | Where-Object { $_ -and $_ -ne $dir }',
    '[Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")',
  ].join('; ');
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', script, installDir], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export async function undo({ purge = false, logger = null } = {}) {
  const actions = [];
  const changes = loadChanges();

  for (const change of [...changes].reverse()) {
    if (change.type === 'desktop') {
      const result = await desktopOff({ logger });
      actions.push({
        action: 'Claude Desktop profile removed',
        detail: result.removedProfile
          ? `restored _meta.json${result.previousAppliedId ? ` (appliedId=${result.previousAppliedId})` : ''}`
          : 'profile was already absent',
      });
    } else if (change.type === 'autostart') {
      const result = autostartOff();
      actions.push({
        action: 'Autostart removed',
        detail: result.removed ? result.kind : `${result.kind}: nothing to remove`,
      });
    } else {
      actions.push({ action: `Unknown change ${change.type}`, detail: 'left untouched' });
    }
  }

  const daemon = await stopDaemon();
  if (daemon.stopped) actions.push({ action: 'Background bridge stopped', detail: `pid ${daemon.pid}` });

  const install = readJson(installPath, null);
  if (install) {
    let removedLinks = 0;
    for (const link of install.binLinks || []) {
      if (removeIfOurs(link, install.installDir || dataDir)) removedLinks += 1;
    }
    if (removedLinks > 0) {
      actions.push({ action: 'Launcher links removed', detail: `${removedLinks} link(s)` });
    }
    if (install.profileBlock && removeProfileBlock()) {
      actions.push({ action: 'Shell profile entry removed', detail: path.join(homeDir, '.profile') });
    }
    if (install.windowsPath && removeWindowsPath(install.installDir || dataDir)) {
      actions.push({ action: 'Windows user PATH cleaned', detail: install.installDir || dataDir });
    }
    try {
      fs.unlinkSync(installPath);
    } catch {
      /* ignore */
    }
  }

  saveChanges([]);

  if (purge) {
    for (const dir of [configDir, dataDir]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        actions.push({ action: 'Removed', detail: dir });
      } catch (error) {
        actions.push({ action: 'Could not remove', detail: `${dir}: ${error.message}` });
      }
    }
  }

  if (actions.length === 0) actions.push({ action: 'Nothing to undo', detail: 'no changes were recorded' });
  return actions;
}
