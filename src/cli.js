import fs from 'node:fs';
import path from 'node:path';
import { createBridgeServer } from './server.js';
import { loadConfig, saveConfig } from './config.js';
import { isValidKeyShape, loadApiKey, promptHidden, saveApiKey } from './credentials.js';
import { fetchModels } from './upstream.js';
import { createLogger } from './log.js';
import { logFile, isTermux, codexHome } from './paths.js';
import {
  ensureService,
  startDaemon,
  stopDaemon,
  serviceStatus,
  checkHealth,
} from './service.js';
import { desktopOn, desktopOff, desktopStatus, desktopPaths } from './desktop.js';
import {
  autostartOn,
  autostartOff,
  autostartStatus,
} from './autostart.js';
import { runDoctor } from './doctor.js';
import { undo } from './undo.js';
import { maskKey, sleep } from './util.js';

const VERSION = '0.2.0';

const HELP = `AgentAdapter ${VERSION} - Claude Code and Codex on AgentRouter

Usage:
  agentrouter <command> [options]

Commands:
  login                 Store an AgentRouter API key (hidden input)
  models                List the live AgentRouter models
  setup                 Guided first-time setup
  serve                 Run the local bridge in the foreground
  status                Show key, service, models and desktop state
  doctor                Run diagnostics (add --json for machines)
  desktop on|off|status Manage the Claude Desktop third-party profile
  autostart on|off      Start the bridge at login (not on Android)
  undo                  Revert everything AgentAdapter changed
  version               Print version and platform

Options:
  --key-stdin           login: read the key from stdin
  --port <n>            serve/desktop: preferred local port
  --daemon              serve: detach and write a pid file
  --foreground          serve: stay attached (used internally)
  --mode stable|full    serve: request mode
  --desktop             setup: also configure Claude Desktop
  --autostart           setup: also enable autostart
  --purge               undo: also delete key, logs and config
  --yes                 undo: do not ask for confirmation
  --restart             desktop on: restart Claude Desktop on Windows
  --json                machine-readable output where supported
  --quick               doctor: skip live model calls
  -h, --help            Show this help

Environment:
  AGENTROUTER_API_KEY       Key override (takes precedence over the file)
  AGENTROUTER_MODE          stable (default) or full
  AGENTROUTER_PORT          Preferred bridge port
  AGENTROUTER_CONFIG_DIR    Override the config directory
`;

function parse(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      options._.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const [rawKey, inline] = arg.slice(2).split('=', 2);
      const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      if (inline !== undefined) {
        options[key] = inline;
      } else if (argv[index + 1] && !argv[index + 1].startsWith('-')) {
        options[key] = argv[index + 1];
        index += 1;
      } else {
        options[key] = true;
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      const map = { h: 'help' };
      const key = map[arg.slice(1)] || arg.slice(1);
      options[key] = true;
      continue;
    }
    options._.push(arg);
  }
  return options;
}

function printModels(models) {
  const width = Math.max(...models.map((model) => model.id.length), 4);
  for (const model of models) {
    const types = Array.isArray(model.endpointTypes) ? model.endpointTypes.join(',') : 'openai';
    process.stdout.write(`${model.id.padEnd(width)}  ${types}\n`);
  }
}

async function login({ keyStdin = false } = {}) {
  let key;
  if (keyStdin) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    key = Buffer.concat(chunks).toString('utf8').trim();
  } else {
    key = await promptHidden('AgentRouter API key (input hidden): ');
  }

  if (!key) throw new Error('No key entered.');
  if (!isValidKeyShape(key)) {
    throw new Error('That does not look like an AgentRouter key (expected sk-…).');
  }

  process.stderr.write('Checking the key against AgentRouter…\n');
  const models = await fetchModels(key);
  saveApiKey(key);
  process.stdout.write(`Saved ${maskKey(key)} to the protected credentials file.\n`);
  process.stdout.write(`${models.length} models are available: ${models.map((model) => model.id).join(', ')}\n`);
  return 0;
}

function printSetupNextSteps() {
  process.stdout.write(`
Next steps:
  1. cc-agent                 Claude Code with the model menu
  2. codex-agent              Codex CLI with the model menu
  3. agentrouter desktop on   Connect Claude Desktop (restart the app afterwards)
  4. agentrouter doctor       Verify the whole path
  5. agentrouter undo         Revert every change
`);
}

async function main(argv) {
  const options = parse(argv);
  if (options.help || options._.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }

  const command = options._[0];
  const sub = options._[1];
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, file: logFile });

  try {
    if (command === 'version') {
      process.stdout.write(
        `AgentAdapter ${VERSION}\nNode ${process.version}\n${process.platform}/${process.arch}\nTermux: ${isTermux ? 'yes' : 'no'}\n`,
      );
      return 0;
    }

    if (command === 'login') {
      return await login({ keyStdin: Boolean(options.keyStdin) });
    }

    if (command === 'models') {
      const { key } = loadApiKey();
      if (!key) throw new Error('No API key. Run "agentrouter login".');
      const models = await fetchModels(key);
      if (options.json) {
        process.stdout.write(`${JSON.stringify(models, null, 2)}\n`);
      } else {
        printModels(models);
      }
      return 0;
    }

    if (command === 'setup') {
      const { key } = loadApiKey();
      if (!key) {
        await login({ keyStdin: Boolean(options.keyStdin) });
      } else {
        process.stdout.write(`Using existing key ${maskKey(key)}.\n`);
      }

      if (options.port) {
        config.port = Number(options.port);
        saveConfig(config);
      }

      if (options.autostart) {
        try {
          const result = autostartOn();
          process.stdout.write(`Autostart enabled (${result.kind}).\n`);
        } catch (error) {
          process.stderr.write(`Autostart skipped: ${error.message}\n`);
        }
      }

      if (options.desktop) {
        const { key: currentKey } = loadApiKey();
        const models = await fetchModels(currentKey);
        const result = await desktopOn({ config, models, logger, restart: false });
        process.stdout.write(`Claude Desktop profile written: ${result.profile}\n`);
        process.stdout.write(`Bridge: http://127.0.0.1:${result.port}\n`);
        process.stdout.write('Quit Claude Desktop completely and reopen it.\n');
      }

      printSetupNextSteps();
      return 0;
    }

    if (command === 'serve') {
      const { key } = loadApiKey();
      if (!key) throw new Error('No API key. Run "agentrouter login".');
      const port = Number(options.port || config.port);
      const mode = options.mode === 'full' ? 'full' : options.mode === 'stable' ? 'stable' : config.mode;

      if (options.daemon) {
        const result = await startDaemon({ config, logger, mode });
        process.stdout.write(
          result.started
            ? `Bridge started on http://127.0.0.1:${result.port} (pid ${result.pid}).\n`
            : `Bridge already running on http://127.0.0.1:${result.port}.\n`,
        );
        return 0;
      }

      const server = createBridgeServer({
        apiKey: key,
        token: config.helperToken,
        mode,
        logger,
        version: VERSION,
      });

      await new Promise((resolve, reject) => {
        server.once('error', (error) => {
          if (error.code === 'EADDRINUSE') {
            reject(new Error(`Port ${port} is already in use. Try "agentrouter serve --port ${port + 1}".`));
          } else {
            reject(error);
          }
        });
        server.listen(port, '127.0.0.1', resolve);
      });

      logger.info('serve.listening', { port, mode, pid: process.pid });
      process.stderr.write(`AgentAdapter bridge listening on http://127.0.0.1:${port} (${mode}).\n`);

      const shutdown = async (signal) => {
        logger.info('serve.shutdown', { signal });
        server.close();
        await sleep(50);
        process.exit(0);
      };
      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
      return new Promise(() => {});
    }

    if (command === 'status') {
      const { key, source } = loadApiKey();
      const service = await serviceStatus(config);
      const desktop = await desktopStatus();
      const autostart = autostartStatus();
      const payload = {
        version: VERSION,
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        termux: isTermux,
        key: key ? { masked: maskKey(key), source } : null,
        port: config.port,
        mode: config.mode,
        service,
        desktop: {
          installed: desktop.installed,
          appliedId: desktop.appliedId,
          ours: desktop.ours,
          profile: desktop.profile,
        },
        autostart,
        codexHome,
      };

      if (options.json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        process.stdout.write(`AgentAdapter ${VERSION} (${payload.platform})\n`);
        process.stdout.write(`Key:      ${key ? `${maskKey(key)} (${source})` : 'missing'}\n`);
        process.stdout.write(
          `Service:  ${service.running ? `running on 127.0.0.1:${service.port} (${service.mode})` : 'not running'}\n`,
        );
        process.stdout.write(`Mode:     ${config.mode}\n`);
        process.stdout.write(
          `Desktop:  ${desktop.installed ? `${desktop.ours ? 'active' : 'profile present, not active'} (${desktop.profile})` : 'not configured'}\n`,
        );
        process.stdout.write(`Autostart:${autostart.enabled ? ` ${autostart.kind} enabled` : ' off'}\n`);
        process.stdout.write(`Codex home: ${codexHome}\n`);
      }
      return 0;
    }

    if (command === 'doctor') {
      return await runDoctor({
        json: Boolean(options.json),
        quick: Boolean(options.quick),
        logger,
      });
    }

    if (command === 'desktop') {
      if (sub === 'on') {
        const { key } = loadApiKey();
        if (!key) throw new Error('No API key. Run "agentrouter login".');
        const models = await fetchModels(key);
        if (options.port) {
          config.port = Number(options.port);
          saveConfig(config);
        }
        const result = await desktopOn({
          config,
          models,
          logger,
          restart: Boolean(options.restart),
        });
        process.stdout.write(`Profile:  ${result.profile}\n`);
        process.stdout.write(`Meta:     ${result.meta}\n`);
        process.stdout.write(`Bridge:   http://127.0.0.1:${result.port}\n`);
        process.stdout.write(`Backup:   ${result.backupDir}\n`);
        if (result.restartRequired) {
          process.stdout.write(
            '\nQuit Claude Desktop completely (tray included), then open it again.\n',
          );
          process.stdout.write(
            'If the picker stays empty, open Developer -> Configure Third-Party Inference once.\n',
          );
        }
        return 0;
      }

      if (sub === 'off') {
        const result = await desktopOff({ config, logger });
        process.stdout.write(
          result.removedProfile ? 'Claude Desktop profile removed.\n' : 'No profile was installed.\n',
        );
        if (result.restoredMeta) {
          process.stdout.write(
            `_meta.json restored${result.previousAppliedId ? ` (appliedId=${result.previousAppliedId})` : ''}.\n`,
          );
        }
        process.stdout.write('Restart Claude Desktop to apply. CC-Switch is ready to take over again.\n');
        return 0;
      }

      if (sub === 'status' || !sub) {
        const status = await desktopStatus();
        process.stdout.write(`Config library: ${status.configLibrary}\n`);
        process.stdout.write(`Profile:        ${status.installed ? 'present' : 'absent'}\n`);
        process.stdout.write(`Applied ID:     ${status.appliedId || 'none'}\n`);
        process.stdout.write(`Ours:           ${status.ours ? 'yes' : 'no'}\n`);
        if (status.models.length) process.stdout.write(`Models:         ${status.models.join(', ')}\n`);
        return 0;
      }

      throw new Error(`Unknown desktop action "${sub}". Use on, off or status.`);
    }

    if (command === 'autostart') {
      if (sub === 'on') {
        const result = autostartOn();
        process.stdout.write(`Autostart enabled (${result.kind}${result.path ? `: ${result.path}` : ''}).\n`);
        return 0;
      }
      if (sub === 'off') {
        const result = autostartOff();
        process.stdout.write(
          result.removed ? `Autostart removed (${result.kind}).\n` : 'Autostart was not enabled.\n',
        );
        return 0;
      }
      if (sub === 'status' || !sub) {
        const status = autostartStatus();
        process.stdout.write(`${status.enabled ? 'enabled' : 'disabled'} (${status.kind})\n`);
        return 0;
      }
      throw new Error(`Unknown autostart action "${sub}".`);
    }

    if (command === 'undo') {
      if (!options.yes && process.stdin.isTTY) {
        const answer = await promptHidden(
          'Revert the desktop profile, autostart and launcher changes? Type "yes": ',
        );
        if (answer.trim().toLowerCase() !== 'yes') {
          process.stdout.write('Cancelled.\n');
          return 1;
        }
      }
      const actions = await undo({ purge: Boolean(options.purge), logger });
      for (const action of actions) {
        process.stdout.write(`- ${action.action}: ${action.detail}\n`);
      }
      return 0;
    }

    throw new Error(`Unknown command "${command}". Run "agentrouter --help".`);
  } finally {
    logger.close();
  }
}

export { main };
