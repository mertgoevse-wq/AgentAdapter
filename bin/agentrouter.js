#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((error) => {
    process.stderr.write(`agentrouter: ${error.message}\n`);
    if (process.env.AGENTROUTER_DEBUG === '1') process.stderr.write(`${error.stack}\n`);
    process.exitCode = error.exitCode || 1;
  });
