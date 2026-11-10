# Verification log

Date: 2026-11-10
Host: Debian 13 aarch64, PRoot (Termux-like), Node v24.22.1
Tools: Claude Code 2.1.319, Codex CLI 0.165.0
Key: stored only at `~/.config/agentrouter/credentials.json` (mode 0600). It is not printed here and does not exist in the repository.

## 1. Static checks

```
for f in src/*.js bin/*.js test/*.js; do node --check "$f"; done
node bin/agentrouter.js --help
```

Result: all files parsed; help exits 0.

## 2. Unit tests

```
node --test
```

Result: **18 passed, 0 failed** (translate, SSE state machine, server routes, local auth, error paths, Termux sandbox rule). The server suite uses a fake upstream and does not spend API credits.

## 3. Key and model list

```
printf '%s\n' "$KEY" | agentrouter login --key-stdin
agentrouter models
```

Observed:

```
Saved sk-*** to the protected credentials file.
3 models are available: gpt-5.6-sol, gpt-6-astra, gpt-6.1-sol

gpt-5.6-sol  openai
gpt-6-astra  openai
gpt-6.1-sol  openai
```

Permissions:

```
700 /home/mert/.config/agentrouter
600 /home/mert/.config/agentrouter/credentials.json
```

## 4. Diagnostics

```
agentrouter doctor
```

Observed (required checks):

```
✓ Node.js                v24.22.1
✓ API key                sk-*** (file)
✓ Live model list        3: gpt-5.6-sol, gpt-6-astra, gpt-6.1-sol
✓ Client gate            rejects a plain HTTP client (401), as expected
✓ Tools + reasoning      function_call "ping" with call_id
✓ Local /v1/messages     HTTP 200, stop_reason=end_turn, text="OK"
✓ Token counting         14 estimated tokens
✓ Local auth             wrong token is rejected
✓ Claude Code            2.1.319 (Claude Code)
✓ Codex CLI              codex-cli 0.165.0
! Background bridge      not running (normal on Android)
! Claude Desktop profile not installed
! Autostart              off
All required checks passed.
```

Exit code: 0. The three warnings are expected on Android without the desktop app.

## 5. Claude Code: short answer

```
cd /tmp/cc-test
cc-agent -m gpt-5.6-sol -p "Antworte nur mit OK"
```

Observed:

```
OK
CC_EXIT=0
```

No bridge process remained (`127.0.0.1:8787/healthz` down). Claude Code printed `[claude-code:unrecognized_model]` telemetry, which is cosmetic.

## 6. Claude Code: real file task

Prompt: create `hello.js` printing an ISO timestamp, run it with node, fix errors, answer with path and output.

```
cc-agent -m gpt-5.6-sol -p "…" --dangerously-skip-permissions
```

Observed:

```
/tmp/cc-task/hello.js
2026-11-10T14:35:45.390Z
CC_TASK_EXIT=0

console.log(new Date().toISOString());

node hello.js
2026-11-10T14:36:00.491Z
RUN_EXIT=0
```

This proves tool use, file writing and command execution through the bridge.

## 7. Codex: first attempt failed (recorded, then fixed)

`codex-agent -m gpt-5.6-sol exec --skip-git-repo-check -s workspace-write "…"` printed `OK` for a text-only prompt, but the file task failed:

```
Failed to write file /tmp/codex-file/codex-hello.js
/bin/bash -lc 'pwd' … exited 182 in 0ms
```

Cause: Codex's Bubblewrap sandbox cannot execute under PRoot/Termux. This was an environment bug in the integration, not an upstream API error.

Fix: `codex-agent` detects Termux and injects `--dangerously-bypass-approvals-and-sandbox` when the user has not chosen a sandbox flag. It warns and offers `AGENTROUTER_CODEX_SANDBOX=1` as an opt-out. Unit tests cover the rule.

## 8. Codex: file task after the fix

```
codex-agent -m gpt-5.6-sol exec --skip-git-repo-check "…"
```

Observed:

```
[codex-agent] Codex sandbox is unavailable under Termux/PRoot. Running without it.
sandbox: danger-full-access
patch: completed
/tmp/codex-file2/codex-hello.js
codex-ok 2026-11-10T14:43:03.316Z
CODEX_TASK_EXIT=0

node codex-hello.js
codex-ok 2026-11-10T14:43:36.041Z
RUN_EXIT=0
```

`~/.codex/config.toml` SHA-256 before and after:
`de6ad8e2e56fcac5b5ac6717e6676d9df3c4d560617e35ec002fee74f1ce913d`
The normal Codex home was not touched.

## 9. Model menu fallback

```
printf '2\n' | cc-agent -p "Antworte nur mit OK"
```

Observed: menu printed all three models, selected `gpt-6-astra`, returned `OK`, exit 0.

## 10. Error paths

| Command | Result |
|---|---|
| `cc-agent -m does-not-exist -p hi` | exit 1, lists the three valid models, starts nothing |
| `agentrouter autostart on` (Termux) | exit 1, "intentionally not installed on Android/Termux" |
| `agentrouter desktop on` (no app) | exit 1, names the missing `~/.config/Claude-3p` path and the fix |
| `agentrouter undo --yes` | exit 0, "Nothing to undo" when no changes exist |

## 11. Claude Desktop profile round-trip (simulated folder)

A fake `Claude-3p/configLibrary` was used because the real app is not installed.

```
AGENTROUTER_CLAUDE3P_DIR=/tmp/claude3p agentrouter desktop on --port 8791
```

Observed profile fields:

```
inferenceProvider: gateway
inferenceCredentialKind: static
inferenceGatewayBaseUrl: http://127.0.0.1:8791
inferenceGatewayApiKey: *** (local token, not the AgentRouter key)
inferenceGatewayAuthScheme: bearer
inferenceModels: [{name: gpt-5.6-sol}, {name: gpt-6-astra}, {name: gpt-6.1-sol}]
inferenceStreamIdleTimeoutSec: 600
```

`_meta.json` changed from `appliedId: cc-switch-profile` to the AgentAdapter ID, with `keep: true` preserved. After `desktop off` the file was byte-identical to the backup and the profile was deleted. The daemon on 8791 stopped.

This verifies the file mechanics and backup/restore. It does **not** verify what the real Claude Desktop app does with the profile.

## 12. Installer and undo

```
bash scripts/install.sh
~/.local/bin/agentrouter status
~/.local/bin/cc-agent --list
agentrouter undo --yes
```

Observed: install copied the app to `~/.local/share/agentrouter/app`, created three symlinks, printed the login hint. Installed CLI reported the key and three models. Undo removed all three links and the profile PATH block; no link remained. The installed app directory was removed manually afterwards.

## 13. Secret scan

```
grep -rn "sk-[A-Za-z0-9_-]\{20,\}" --exclude-dir=.git .
```

Result: no matches. `.gitignore` excludes credentials, logs, pid files and install records.

## 14. GitHub Actions

Workflow `tests` (`.github/workflows/test.yml`) ran on the pushed commit:

- `ubuntu-latest` and `windows-latest`
- Node 20, 22 and 24
- `node --test` and `node bin/agentrouter.js --help`

Result: **6 of 6 jobs successful** (run 42838273960, conclusion `success`). This verifies the unit suite and CLI parsing on both operating systems. It does not execute the Windows installer, the registry autostart, a live AgentRouter call, or the real Claude Desktop app.

## 15. Windows launcher and installer (PowerShell 7.4 on Linux, not Windows)

No Windows machine is available here. What was actually executed:

```
pwsh -NoProfile -File scripts/install.ps1      # APPDATA/LOCALAPPDATA/USERPROFILE redirected to /tmp/win
iex (Get-Content scripts/bootstrap.ps1 -Raw)   # download + extract + install + cleanup
node --test
```

Observed: the installer resolved Node, copied `bin src scripts docs` and the
root files, wrote the three launchers, created `install.json`, and printed
`Installed: AgentAdapter 0.2.0`. A generated launcher reads:

```bat
@echo off
setlocal
if exist "<node>" (
  "<node>" "<installDir>\bin\cc-agent.js" %*
) else (
  node "<installDir>\bin\cc-agent.js" %*
)
```

The bootstrap one-liner downloaded the archive, installed from it and removed
the temporary files. `install.json` was written without a BOM and `readJson`
returned the recorded install directory, launcher paths and `windowsPath` flag.

Unit tests: **34 total, 32 passed, 2 skipped** on Linux. The two skipped tests
run only on Windows (`process.platform === 'win32'`):

- `spawning a .cmd shim directly fails` — pins the `spawn EINVAL` behaviour this
  change works around.
- `runTool starts a .cmd shim and keeps the arguments intact` — starts a real
  `.cmd` file through `cmd.exe` with `hello world`, `a&b`, `(c)`, `d=e` and a
  non-ASCII argument, and compares the child's `argv`.

Those two, plus the shim-resolution and quoting tests, also run in the
`windows-latest` jobs of the workflow. That is the first real Windows execution
of the launcher path, but it is CI, not the reporter's laptop.

The installer was **not** executed by Windows PowerShell 5.1, and the registry
autostart, Claude Desktop and real Claude Code sessions were not exercised on
Windows hardware.

## 16. Native Windows path (no WSL)

Implemented and unit-tested, not executed on Windows:

- `cc-agent` resolves `claude.exe` from `%USERPROFILE%\.local\bin`, the npm shim
  from `%APPDATA%\npm`, and anything on PATH; a native `.exe` wins over a `.cmd`.
- `CLAUDE_CODE_GIT_BASH_PATH` is exported when Git Bash exists
  (`%ProgramFiles%\Git\bin\bash.exe`, `%ProgramFiles(x86)%`, or next to the
  `git.exe` on PATH). Without Git for Windows the variable stays unset and
  Claude Code uses its PowerShell tool.
- Missing CLI messages list the native installers
  (`irm https://claude.ai/install.ps1 | iex`, `winget install Anthropic.ClaudeCode`,
  `npm install -g @anthropic-ai/claude-code`) and state that WSL is not needed.
- `install.ps1` reports whether Claude Code, Codex and Git Bash were found.
- `agentrouter doctor` on Windows adds a `Command shell (Win)` line naming the
  detected Git Bash or the PowerShell-tool fallback.

Observed here (Linux, PowerShell 7.4): `node --test` green with the new Git Bash
and environment tests; the installer completed and printed its native-Windows
check block with "Claude Code is not installed" / "Codex CLI … optional" for the
empty sandbox. The WSL-free behaviour of the real Claude Code binary was not
executed, because no Windows machine and no live AgentRouter key are available
in this environment.

## Not verified

- Windows installation under Windows PowerShell 5.1, PATH refresh after login, registry autostart, and the generated `.cmd` wrappers on real hardware.
- Claude Desktop with the real app (Windows, macOS or Linux).
- Linux systemd autostart.
- `--full` mode against live models.
- Prompt-cache behavior.
- Any macOS path.
- Windows installer on real hardware, registry autostart, and the `.cmd` wrappers outside CI.
