import path from 'node:path';
import { loadConfig, saveConfig, resolveMode } from './config.js';
import { loadApiKey } from './credentials.js';
import { fetchModels } from './upstream.js';
import { selectModel, CancelledError } from './menu.js';
import { ensureService, stopService, checkHealth } from './service.js';
import {
  claudeEnvironment,
  codexEnvironment,
  codexConfigText,
  runTool,
} from './launch.js';
import { createLogger } from './log.js';
import { logFile, modelsCachePath, codexHome, isTermux } from './paths.js';
import { maskKey, writeJsonAtomic } from './util.js';

const HELP = {
  claude: `cc-agent - start Claude Code on an AgentRouter model

Usage:
  cc-agent [options] [-- <claude arguments>]

Options:
  -m, --model <id>   Skip the menu and use this model
      --list         Print the live model list and exit
      --json         With --list: print JSON
      --dry-run      Show the environment and exit without starting Claude Code
      --no-service   Use an already running bridge on the configured port
      --full         Keep reasoning and Anthropic beta fields
  -h, --help         Show this help

Examples:
  cc-agent
  cc-agent -m gpt-5.6-sol -p "Explain this repository"
  cc-agent -- --resume`,
  codex: `codex-agent - start Codex CLI on an AgentRouter model

Usage:
  codex-agent [options] [-- <codex arguments>]

Options:
  -m, --model <id>   Skip the menu and use this model
      --list         Print the live model list and exit
      --json         With --list: print JSON
      --dry-run      Show the isolated Codex config and exit
      --no-service   Use an already running bridge on the configured port
      --full         Keep reasoning and Anthropic beta fields
  -h, --help         Show this help

Examples:
  codex-agent
  codex-agent -m gpt-5.6-sol exec --skip-git-repo-check --full-auto "List the files"
  codex-agent -- --profile work`,
};

function parseArgs(argv) {
  const options = {
    model: null,
    list: false,
    json: false,
    dryRun: false,
    noService: false,
    full: false,
    help: false,
    passthrough: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      options.passthrough.push(...argv.slice(index + 1));
      break;
    }
    if (arg === '-m' || arg === '--model') {
      options.model = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
      continue;
    }
    if (arg === '--list') {
      options.list = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-service') {
      options.noService = true;
      continue;
    }
    if (arg === '--full') {
      options.full = true;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    options.passthrough.push(arg);
  }

  return options;
}

const SANDBOX_FLAGS = [
  '-s',
  '--sandbox',
  '--full-auto',
  '--approve-for-me',
  '--dangerously-bypass-approvals-and-sandbox',
];

export function codexSandboxArgs(args, { termux = isTermux, override = false } = {}) {
  if (!termux || override) return args;
  const hasChoice = args.some(
    (arg) => SANDBOX_FLAGS.includes(arg) || arg.startsWith('--sandbox='),
  );
  if (hasChoice) return args;

  const copy = [...args];
  const execIndex = copy.indexOf('exec');
  if (execIndex >= 0) copy.splice(execIndex + 1, 0, '--dangerously-bypass-approvals-and-sandbox');
  else copy.unshift('--dangerously-bypass-approvals-and-sandbox');
  return copy;
}

function saveModelsCache(models) {
  try {
    writeJsonAtomic(modelsCachePath, { at: new Date().toISOString(), models });
  } catch {
    /* cache is optional */
  }
}

export async function runAgent({ tool, argv }) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${HELP[tool]}\n`);
    return 0;
  }

  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, file: logFile });
  const { key, source } = loadApiKey();

  if (!key) {
    process.stderr.write(
      'No AgentRouter API key found.\nRun "agentrouter login" first, or set AGENTROUTER_API_KEY.\n',
    );
    return 1;
  }

  let models;
  try {
    models = await fetchModels(key);
  } catch (error) {
    process.stderr.write(`Cannot load AgentRouter models: ${error.message}\n`);
    if (error.status === 401) {
      process.stderr.write('The key was rejected. Run "agentrouter login" to replace it.\n');
    }
    return 1;
  }
  saveModelsCache(models);

  if (options.list) {
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ models }, null, 2)}\n`);
    } else {
      for (const model of models) process.stdout.write(`${model.id}\n`);
    }
    return 0;
  }

  let model = options.model;
  if (model && !models.some((entry) => entry.id === model)) {
    process.stderr.write(`Model "${model}" is not available. Available models:\n`);
    for (const entry of models) process.stderr.write(`  ${entry.id}\n`);
    return 1;
  }

  if (!model) {
    try {
      model = await selectModel(models, {
        lastModel: config.lastModel || null,
        title: tool === 'claude' ? 'Claude Code model' : 'Codex model',
      });
    } catch (error) {
      if (error instanceof CancelledError) return 130;
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
  }

  config.lastModel = model;
  try {
    saveConfig(config);
  } catch {
    /* non-fatal */
  }

  const mode = resolveMode(config, options.full);
  let service = null;
  try {
    if (options.noService) {
      const health = await checkHealth(config.port);
      if (!health.ok) {
        throw new Error(
          `No bridge is running on 127.0.0.1:${config.port}. Start it with "agentrouter serve" or omit --no-service.`,
        );
      }
      service = { port: config.port, child: null, reused: true, mode: health.mode || null };
    } else {
      service = await ensureService({ config, logger, mode });
    }

    if (tool === 'claude') {
      const env = claudeEnvironment({
        port: service.port,
        token: config.helperToken,
        model,
        contextWindow: config.contextWindow,
        mode,
      });

      if (options.dryRun) {
        process.stdout.write(
          `${JSON.stringify(
            {
              tool: 'claude',
              model,
              port: service.port,
              mode,
              keySource: source,
              key: maskKey(key),
              command: 'claude',
              args: options.passthrough,
              env: {
                ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL,
                ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
                ANTHROPIC_AUTH_TOKEN: '***',
                CLAUDE_CODE_MAX_CONTEXT_TOKENS: env.CLAUDE_CODE_MAX_CONTEXT_TOKENS,
              },
            },
            null,
            2,
          )}\n`,
        );
        return 0;
      }

      logger.info('claude.start', {
        model,
        port: service.port,
        mode,
        reusedService: service.reused,
        args: options.passthrough,
      });
      const code = await runTool('claude', options.passthrough, env);
      logger.info('claude.exit', { model, code });
      return code;
    }

    const env = codexEnvironment({ port: service.port, token: config.helperToken, model });

    if (options.dryRun) {
      process.stdout.write(
        `${JSON.stringify(
          {
            tool: 'codex',
            model,
            port: service.port,
            mode,
            keySource: source,
            key: maskKey(key),
            codexHome,
            configPath: path.join(codexHome, 'config.toml'),
            configToml: codexConfigText({ model, port: service.port }),
            command: 'codex',
            args: options.passthrough,
          },
          null,
          2,
        )}\n`,
      );
      return 0;
    }

    const codexArgs = codexSandboxArgs(options.passthrough, {
      override: process.env.AGENTROUTER_CODEX_SANDBOX === '1',
    });
    const sandboxInjected =
      codexArgs.length !== options.passthrough.length ||
      codexArgs.some((arg, index) => arg !== options.passthrough[index]);

    if (sandboxInjected) {
      process.stderr.write(
        '[codex-agent] Codex sandbox is unavailable under Termux/PRoot. Running without it.\n' +
          '[codex-agent] Set AGENTROUTER_CODEX_SANDBOX=1 to keep Codex flags unchanged.\n',
      );
    }

    logger.info('codex.start', {
      model,
      port: service.port,
      mode,
      reusedService: service.reused,
      sandboxInjected,
      args: codexArgs,
    });
    const code = await runTool('codex', codexArgs, env);
    logger.info('codex.exit', { model, code });
    return code;
  } finally {
    if (service?.child) await stopService(service.child);
  }
}
