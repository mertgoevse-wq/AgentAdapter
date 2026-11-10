import test from 'node:test';
import assert from 'node:assert/strict';
import { codexSandboxArgs } from '../src/agent.js';

test('Termux injects the bypass flag after exec', () => {
  const args = codexSandboxArgs(['exec', '--skip-git-repo-check', 'do it'], { termux: true });
  assert.deepEqual(args, [
    'exec',
    '--dangerously-bypass-approvals-and-sandbox',
    '--skip-git-repo-check',
    'do it',
  ]);
});

test('Termux injects the bypass flag for the interactive TUI', () => {
  const args = codexSandboxArgs(['--profile', 'work'], { termux: true });
  assert.deepEqual(args, ['--dangerously-bypass-approvals-and-sandbox', '--profile', 'work']);
});

test('explicit sandbox choices are never overridden', () => {
  const args = ['exec', '-s', 'workspace-write', 'task'];
  assert.equal(codexSandboxArgs(args, { termux: true }), args);
  const bypass = ['exec', '--dangerously-bypass-approvals-and-sandbox', 'task'];
  assert.equal(codexSandboxArgs(bypass, { termux: true }), bypass);
});

test('non-Termux platforms are untouched', () => {
  const args = ['exec', 'task'];
  assert.equal(codexSandboxArgs(args, { termux: false }), args);
});

test('the environment override disables injection', () => {
  const args = ['exec', 'task'];
  assert.equal(codexSandboxArgs(args, { termux: true, override: true }), args);
});
