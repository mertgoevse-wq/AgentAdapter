import readline from 'node:readline';
import { truncate } from './util.js';

export class CancelledError extends Error {
  constructor() {
    super('Cancelled.');
    this.name = 'CancelledError';
    this.exitCode = 130;
  }
}

function visibleWindow(models, selected, size) {
  if (models.length <= size) return { start: 0, end: models.length };
  let start = Math.max(0, selected - Math.floor(size / 2));
  const end = Math.min(models.length, start + size);
  start = Math.max(0, end - size);
  return { start, end };
}

export async function selectModel(models, { lastModel = null, title = 'AgentRouter models' } = {}) {
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('AgentRouter returned no models.');
  }

  const initial = Math.max(0, models.findIndex((model) => model.id === lastModel));
  const stdout = process.stdout;
  const stdin = process.stdin;

  if (!stdin.isTTY || !stdout.isTTY) {
    return selectModelPlain(models, { lastModel, title });
  }

  return new Promise((resolve, reject) => {
    let selected = initial;
    let renderedLines = 0;
    let closed = false;

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write('\u001b[?25l');

    const lineCount = () => Math.min(models.length, 12) + 5;

    const draw = () => {
      const { start, end } = visibleWindow(models, selected, 12);
      const lines = [];
      lines.push(`\u001b[36m?\u001b[0m ${title}  \u001b[2m↑/↓, Enter, q\u001b[0m`);
      lines.push('');
      for (let index = start; index < end; index += 1) {
        const model = models[index];
        const isSelected = index === selected;
        const marker = isSelected ? '\u001b[36m❯\u001b[0m' : ' ';
        const label = truncate(model.id, 46).padEnd(46);
        const suffix = model.id === lastModel ? ' \u001b[2mlast used\u001b[0m' : '';
        lines.push(
          isSelected
            ? `${marker} \u001b[36m${label}\u001b[0m${suffix}`
            : `${marker} ${label}${suffix}`,
        );
      }
      lines.push('');
      lines.push(`\u001b[2m${end - start} of ${models.length} models\u001b[0m`);

      if (renderedLines > 0) stdout.write(`\u001b[${renderedLines}A`);
      for (const line of lines) {
        stdout.write(`\u001b[2K${line}\n`);
      }
      const extra = Math.max(0, renderedLines - lines.length);
      for (let index = 0; index < extra; index += 1) stdout.write('\u001b[2K\n');
      renderedLines = Math.max(lines.length, renderedLines);
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('keypress', onKey);
      stdout.write('\u001b[?25h');
      stdout.write(`\u001b[${renderedLines}A\u001b[J`);
      stdout.write(`\u001b[36m→\u001b[0m ${models[selected].id}\n`);
    };

    const onKey = (str, key) => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new CancelledError());
        return;
      }
      if (key.name === 'escape' || key.name === 'q') {
        cleanup();
        reject(new CancelledError());
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        const chosen = models[selected];
        cleanup();
        resolve(chosen.id);
        return;
      }
      if (key.name === 'up' || key.name === 'k') {
        selected = (selected - 1 + models.length) % models.length;
        draw();
        return;
      }
      if (key.name === 'down' || key.name === 'j') {
        selected = (selected + 1) % models.length;
        draw();
      }
    };

    stdin.on('keypress', onKey);
    draw();
  });
}

async function selectModelPlain(models, { lastModel, title }) {
  const stderr = process.stderr;
  stderr.write(`\n${title}\n`);
  models.forEach((model, index) => {
    const marker = model.id === lastModel ? ' (last used)' : '';
    stderr.write(`  ${String(index + 1).padStart(2)}. ${model.id}${marker}\n`);
  });
  const fallback = lastModel || models[0].id;
  stderr.write(`Model [${models.findIndex((model) => model.id === lastModel) + 1 || 1}]: `);

  const answer = await readLine();
  const trimmed = answer.trim();
  if (!trimmed) return fallback;

  const number = Number(trimmed);
  if (Number.isInteger(number) && number >= 1 && number <= models.length) {
    return models[number - 1].id;
  }

  const exact = models.find((model) => model.id === trimmed);
  if (exact) return exact.id;

  const prefix = models.filter((model) => model.id.startsWith(trimmed));
  if (prefix.length === 1) return prefix[0].id;

  throw new Error(`Unknown model "${trimmed}".`);
}

function readLine() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question('', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
