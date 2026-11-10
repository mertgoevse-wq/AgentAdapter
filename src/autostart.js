import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { binPath, configDir, homeDir, isTermux, isWindows } from './paths.js';
import { ensureDir, readText, writeFileAtomic } from './util.js';
import { appendChange, findChange, loadChanges, saveChanges } from './state.js';

const UNIT_NAME = 'agentrouter.service';
const PROFILE_BEGIN = '# >>> agent-adapter autostart >>>';
const PROFILE_END = '# <<< agent-adapter autostart <<<';
const RUN_KEY = 'AgentAdapter';

function unitPath() {
  return path.join(homeDir, '.config', 'systemd', 'user', UNIT_NAME);
}

function profilePath() {
  return path.join(homeDir, '.profile');
}

function systemdAvailable() {
  if (isWindows || isTermux) return false;
  try {
    execFileSync('systemctl', ['--user', 'show-environment'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function unitText() {
  return `[Unit]
Description=AgentAdapter bridge for AgentRouter
After=network-online.target

[Service]
Type=simple
ExecStart="${process.execPath}" "${binPath('agentrouter.js')}" serve --foreground
Environment=AGENTROUTER_CONFIG_DIR=${configDir}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;
}

export function autostartStatus() {
  if (isWindows) {
    try {
      const output = execFileSync(
        'reg',
        ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', RUN_KEY],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return { enabled: output.includes(RUN_KEY), kind: 'windows-run' };
    } catch {
      return { enabled: false, kind: 'windows-run' };
    }
  }
  if (systemdAvailable()) {
    try {
      execFileSync('systemctl', ['--user', 'is-enabled', UNIT_NAME], { stdio: 'ignore' });
      return { enabled: true, kind: 'systemd-user', path: unitPath() };
    } catch {
      return { enabled: false, kind: 'systemd-user', path: unitPath() };
    }
  }
  const profile = readText(profilePath(), '');
  return {
    enabled: Boolean(profile && profile.includes(PROFILE_BEGIN)),
    kind: 'profile',
    path: profilePath(),
  };
}

export function autostartOn() {
  if (isTermux) {
    throw new Error(
      'Autostart is intentionally not installed on Android/Termux. cc-agent starts the bridge only while it runs.',
    );
  }

  if (isWindows) {
    const command = `"${process.execPath}" "${binPath('agentrouter.js')}" serve --daemon`;
    execFileSync(
      'reg',
      [
        'add',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        '/v',
        RUN_KEY,
        '/t',
        'REG_SZ',
        '/d',
        command,
        '/f',
      ],
      { stdio: 'ignore' },
    );
    appendChange({ type: 'autostart', kind: 'windows-run', key: RUN_KEY });
    return { kind: 'windows-run', command };
  }

  if (systemdAvailable()) {
    ensureDir(path.dirname(unitPath()));
    writeFileAtomic(unitPath(), unitText(), 0o600);
    execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
    execFileSync('systemctl', ['--user', 'enable', '--now', UNIT_NAME], { stdio: 'ignore' });
    appendChange({ type: 'autostart', kind: 'systemd-user', unit: unitPath() });
    return { kind: 'systemd-user', path: unitPath() };
  }

  const current = readText(profilePath(), '');
  if (current.includes(PROFILE_BEGIN)) {
    return { kind: 'profile', path: profilePath(), already: true };
  }
  const block = [
    '',
    PROFILE_BEGIN,
    `[ -x "${binPath('agentrouter.js')}" ] && "${process.execPath}" "${binPath('agentrouter.js')}" serve --daemon >/dev/null 2>&1`,
    PROFILE_END,
    '',
  ].join('\n');
  fs.appendFileSync(profilePath(), block, { mode: 0o600 });
  appendChange({ type: 'autostart', kind: 'profile', file: profilePath() });
  return { kind: 'profile', path: profilePath() };
}

export function autostartOff() {
  const result = { removed: false, kind: null };

  if (isWindows) {
    try {
      execFileSync(
        'reg',
        ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', RUN_KEY, '/f'],
        { stdio: 'ignore' },
      );
      result.removed = true;
    } catch {
      /* already absent */
    }
    result.kind = 'windows-run';
  } else if (fs.existsSync(unitPath())) {
    try {
      execFileSync('systemctl', ['--user', 'disable', '--now', UNIT_NAME], { stdio: 'ignore' });
    } catch {
      /* unit may not be active */
    }
    try {
      fs.unlinkSync(unitPath());
    } catch {
      /* ignore */
    }
    try {
      execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
    result.removed = true;
    result.kind = 'systemd-user';
  } else {
    const profile = readText(profilePath(), '');
    if (profile.includes(PROFILE_BEGIN)) {
      const cleaned = profile.replace(
        new RegExp(`\\n?${PROFILE_BEGIN}[\\s\\S]*?${PROFILE_END}\\n?`, 'g'),
        '\n',
      );
      writeFileAtomic(profilePath(), cleaned, 0o600);
      result.removed = true;
    }
    result.kind = 'profile';
  }

  const changes = loadChanges().filter((entry) => entry.type !== 'autostart');
  saveChanges(changes);
  return result;
}

export function autostartEntry() {
  return findChange((entry) => entry.type === 'autostart');
}
