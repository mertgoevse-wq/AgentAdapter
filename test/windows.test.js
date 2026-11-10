import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  buildCmdLine,
  claudeEnvironment,
  findExecutable,
  isWindowsBatchFile,
  quoteCmdArgument,
  runTool,
  toolCommand,
} from '../src/launch.js';

const onWindows = process.platform === 'win32';

const winEnv = {
  PATH: 'C:\\Windows\\system32;C:\\Users\\me\\AppData\\Roaming\\npm',
  PATHEXT: '.COM;.EXE;.BAT;.CMD',
  APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
  USERPROFILE: 'C:\\Users\\me',
  LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
};

test('batch detection is case-insensitive', () => {
  assert.equal(isWindowsBatchFile('C:\\npm\\claude.cmd'), true);
  assert.equal(isWindowsBatchFile('probe.BAT'), true);
  assert.equal(isWindowsBatchFile('C:\\tools\\claude.exe'), false);
  assert.equal(isWindowsBatchFile(null), false);
});

test('findExecutable locates the npm shim on PATH', () => {
  const target = 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd';
  const exists = (file) => file.toLowerCase() === target.toLowerCase();
  assert.equal(findExecutable('claude', { env: winEnv, exists }), target);
});

test('findExecutable prefers a native .exe over the .cmd shim', () => {
  const exists = (file) => /claude\.(exe|cmd)$/i.test(file);
  assert.equal(findExecutable('claude', { env: winEnv, exists }), 'C:\\Windows\\system32\\claude.exe');
});

test('findExecutable also looks in the native Claude install folder', () => {
  const target = 'C:\\Users\\me\\.local\\bin\\claude.exe';
  const exists = (file) => file === target;
  assert.equal(findExecutable('claude', { env: winEnv, exists }), target);
});

test('findExecutable returns null when nothing matches', () => {
  assert.equal(findExecutable('claude', { env: winEnv, exists: () => false }), null);
});

test('.cmd shims are routed through cmd.exe', () => {
  const env = { PATH: 'C:\\npm', PATHEXT: '.EXE;.CMD' };
  const exists = (file) => file === 'C:\\npm\\claude.cmd';
  const invitation = toolCommand('claude', ['-p', 'hello world'], {
    platform: 'win32',
    env,
    exists,
  });
  assert.equal(invitation.command, 'cmd.exe');
  assert.equal(invitation.viaCmd, true);
  assert.equal(invitation.windowsVerbatimArguments, true);
  assert.deepEqual(invitation.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(invitation.args[3], '""C:\\npm\\claude.cmd" "-p" "hello world""');
});

test('native executables and POSIX commands are spawned directly', () => {
  const env = { PATH: 'C:\\tools', PATHEXT: '.EXE;.CMD' };
  const exists = (file) => file === 'C:\\tools\\claude.exe';
  const native = toolCommand('claude', ['--version'], { platform: 'win32', env, exists });
  assert.equal(native.command, 'C:\\tools\\claude.exe');
  assert.deepEqual(native.args, ['--version']);
  assert.equal(native.viaCmd, false);

  const posix = toolCommand('claude', ['-p', 'x'], { platform: 'linux', env: {} });
  assert.equal(posix.command, 'claude');
  assert.deepEqual(posix.args, ['-p', 'x']);
});

test('cmd quoting keeps spaces, quotes and trailing backslashes', () => {
  assert.equal(quoteCmdArgument('plain'), '"plain"');
  assert.equal(quoteCmdArgument('two words'), '"two words"');
  assert.equal(quoteCmdArgument('C:\\dir with space\\'), '"C:\\dir with space\\\\"');
  assert.equal(quoteCmdArgument('say "hi"'), '"say \\"hi\\""');
  assert.equal(buildCmdLine('C:\\p\\claude.cmd'), '""C:\\p\\claude.cmd""');
});

test('Claude Code gets the local gateway and no competing credentials', () => {
  const env = claudeEnvironment(
    { port: 8787, token: 'local-token', model: 'gpt-5.6-sol', contextWindow: 200000, mode: 'stable' },
    {
      baseEnv: {
        PATH: '/usr/bin',
        ANTHROPIC_API_KEY: 'sk-upstream',
        CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
        CLAUDE_CODE_USE_BEDROCK: '1',
        ANTHROPIC_BEDROCK_BASE_URL: 'https://bedrock.example',
      },
    },
  );
  assert.equal(env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:8787');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'local-token');
  assert.equal(env.ANTHROPIC_MODEL, 'gpt-5.6-sol');
  assert.equal(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'gpt-5.6-sol');
  assert.equal(env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'gpt-5.6-sol');
  assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'gpt-5.6-sol');
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert.equal(env.CLAUDE_CODE_USE_BEDROCK, undefined);
  assert.equal(env.ANTHROPIC_BEDROCK_BASE_URL, undefined);
  assert.equal(env.PATH, '/usr/bin');
});

test('spawning a .cmd shim directly fails (the bug this guards against)', { skip: !onWindows }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentrouter-shim-'));
  try {
    const shim = path.join(dir, 'noop.cmd');
    fs.writeFileSync(shim, '@echo off\r\nexit /b 0\r\n');

    let code = null;
    try {
      const child = spawn(shim, [], { stdio: 'ignore' });
      await new Promise((resolve) => {
        child.once('error', (error) => {
          code = error.code;
          resolve();
        });
        child.once('exit', resolve);
      });
    } catch (error) {
      code = error.code;
    }
    assert.equal(code, 'EINVAL');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runTool starts a .cmd shim and keeps the arguments intact', { skip: !onWindows }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentrouter-run-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'probe.js'),
      'const fs = require("node:fs");\nconst path = require("node:path");\n' +
        'fs.writeFileSync(path.join(__dirname, "args.json"), JSON.stringify(process.argv.slice(2)));\n',
    );
    fs.writeFileSync(path.join(dir, 'probe.cmd'), '@echo off\r\nnode "%~dp0probe.js" %*\r\n');

    const expected = ['hello world', 'a&b', '(c)', 'd=e', 'grüße'];
    const code = await runTool(path.join(dir, 'probe.cmd'), expected, process.env);
    assert.equal(code, 0);

    const written = JSON.parse(fs.readFileSync(path.join(dir, 'args.json'), 'utf8'));
    assert.deepEqual(written, expected);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
