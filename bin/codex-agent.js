#!/usr/bin/env node
import { runAgent } from '../src/agent.js';

runAgent({ tool: 'codex', argv: process.argv.slice(2) })
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((error) => {
    process.stderr.write(`codex-agent: ${error.message}\n`);
    if (process.env.AGENTROUTER_DEBUG === '1') process.stderr.write(`${error.stack}\n`);
    process.exitCode = error.exitCode || 1;
  });
