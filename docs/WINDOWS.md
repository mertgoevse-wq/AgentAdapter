# Windows: install and work on AgentAdapter while OmniRoute keeps routing

This guide assumes Claude Code is currently routed through OmniRoute or CC-Switch to NVIDIA. You do **not** need to switch that off to clone or develop AgentAdapter.

## 0. Native Windows only — WSL is never required

AgentAdapter is plain Node.js and Claude Code ships a native Windows build, so
the whole chain runs from PowerShell or CMD. Nothing here uses `wsl.exe`, a
Linux distribution, Git Bash or a POSIX shell.

| Piece | Native requirement |
|---|---|
| AgentAdapter bridge | Node.js 20+ (Windows 10 1809+ or Server 2019+, x64/ARM64) |
| Claude Code | `claude.exe` from the native installer, or the npm package (win32-x64/win32-arm64 are supported) |
| Codex CLI | `npm install -g @openai/codex` (`codex.cmd`) |
| Bash tool inside Claude Code | Optional: Git for Windows. Without it Claude Code uses its PowerShell tool |
| Sandboxed command execution | Not supported natively; only WSL 2 offers it. This is a Claude Code limitation, not an AgentAdapter one |

Install Claude Code natively (no WSL, no administrator rights):

```powershell
irm https://claude.ai/install.ps1 | iex
# or
winget install Anthropic.ClaudeCode
# or
npm install -g @anthropic-ai/claude-code
```

The native installer places `claude.exe` in `%USERPROFILE%\.local\bin`;
`cc-agent` also looks there, in `%APPDATA%\npm` and on PATH, and prefers a
native `.exe` over a `.cmd` shim.

Git for Windows is optional but recommended, because most repositories assume
Bash syntax:

```powershell
winget install --id Git.Git -e
```

When Git Bash is present, `cc-agent` passes `CLAUDE_CODE_GIT_BASH_PATH` to
Claude Code so the Bash tool works without guessing. When it is absent, Claude
Code uses PowerShell and `agentrouter doctor` reports that as a warning, not a
failure.

If a guide or an error tells you to install WSL for this setup: that advice
predates native Windows support. The only thing that genuinely needs WSL 2 is
Claude Code's sandbox mode.

## 1. Clone without touching the current route

```powershell
cd $HOME\Projects
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
```

Your existing `~/.claude/settings.json`, `~/.codex/config.toml`, `~/.codex/auth.json` and CC-Switch files are not modified by the clone.

If you want Claude Code to work on this repository while it is still routed through OmniRoute, start it normally from the repository:

```powershell
cd $HOME\Projects\AgentAdapter
claude
```

That session uses OmniRoute. AgentAdapter only changes routing inside `cc-agent` and `codex-agent`, for their own child processes.

## 2. Install

Without a clone (downloads the repository archive, installs, cleans up):

```powershell
irm https://raw.githubusercontent.com/mertgoevse-wq/AgentAdapter/main/scripts/bootstrap.ps1 | iex
```

From an existing clone, any of these work:

```powershell
.\scripts\install.cmd
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

`install.cmd` is the double-click/copy-paste path: it bypasses the execution
policy for that one process, so nothing on the machine changes.

The installer:

- finds Node 20+ (`AGENTROUTER_NODE`, PATH, `%ProgramFiles%\nodejs`, nvm) and
  reports the exact path it used
- copies the app to `%LOCALAPPDATA%\Programs\agentrouter`
- creates `agentrouter.cmd`, `cc-agent.cmd`, `codex-agent.cmd` that call Node by
  its absolute path, with a fallback to `node` on PATH
- adds that folder to the **user** PATH (no admin, no machine-wide change)
- verifies the installed copy with `agentrouter version`
- records the change in `%APPDATA%\agentrouter\install.json` for `agentrouter undo`

Open a **new** PowerShell window so the PATH is visible.

If anything fails, the installer prints the message and the failing line. Report
those two lines instead of a screenshot of a flashing window.

## 3. Store the key

```powershell
agentrouter login
```

Input is hidden. The key is written to `%APPDATA%\agentrouter\credentials.json` with user-only ACLs. It is never written to the repository, Codex config or the desktop profile.

Verify:

```powershell
agentrouter models
agentrouter doctor --quick
```

## 4. Use Claude Code through AgentRouter

```powershell
cd $HOME\Projects\some-project
cc-agent
```

Pick a model with the arrow keys and press Enter. This process gets:

- `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>`
- `ANTHROPIC_AUTH_TOKEN=<local bridge token>`
- `ANTHROPIC_MODEL=<chosen model>`
- `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`,
  `ANTHROPIC_DEFAULT_HAIKU_MODEL` — all pinned to the same model, because
  Claude Code otherwise sends built-in Claude IDs for background tasks and the
  `/model` aliases, which AgentRouter does not serve
- `CLAUDE_CODE_MAX_CONTEXT_TOKENS=200000`

`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_PROFILE` and the
Bedrock/Vertex switches are removed from the child process, so a leftover
credential cannot bypass the bridge.

Nothing else changes. The next plain `claude` session still uses OmniRoute.

For a one-shot check:

```powershell
cc-agent -m gpt-5.6-sol -p "Reply with exactly OK"
```

## 5. Use Codex through AgentRouter

```powershell
cd $HOME\Projects\some-project
codex-agent
```

`codex-agent` uses an isolated `CODEX_HOME`:

```
%LOCALAPPDATA%\agentrouter\codex\config.toml
```

Your normal Codex provider, login and history in `%USERPROFILE%\.codex` are untouched. On Windows, Codex's sandbox works normally; no bypass is injected.

## 6. Make Claude Desktop use AgentRouter

1. Install and start Claude Desktop once.
2. Enable the third-party mode: **Help → Troubleshooting → Enable developer mode**, then **Developer → Configure Third-Party Inference**.
3. Close the app.
4. Run:

```powershell
agentrouter desktop on
```

5. Quit Claude Desktop completely, including the tray icon, and reopen it.
6. The picker should list `gpt-5.6-sol`, `gpt-6-astra`, `gpt-6.1-sol`.

What was written:

```
%LOCALAPPDATA%\Claude-3p\configLibrary\6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42.json
%LOCALAPPDATA%\Claude-3p\configLibrary\_meta.json
```

The profile uses `http://127.0.0.1:8787`, a local bearer token and explicit model entries. A timestamped backup of `_meta.json` is stored under `%APPDATA%\agentrouter\backups\`.

If the picker stays empty:

- confirm the bridge is running: `agentrouter status`
- confirm `agentrouter desktop status` says `Ours: yes`
- fully quit the app; closing the window is not enough
- open the in-app third-party configuration once and check the gateway URL

**Known gap:** this flow was verified only against a simulated config library. The real Windows app still needs one end-to-end run.

## 7. Go back to CC-Switch / OmniRoute

```powershell
agentrouter desktop off
```

This removes only AgentAdapter's profile and restores the previous `_meta.json` (including the CC-Switch `appliedId`). Restart Claude Desktop. CC-Switch can now apply its NVIDIA route again.

`agentrouter desktop off` does not edit CC-Switch files. It never did.

## 8. Continue developing with Claude Code or Freebuff

The repository is self-contained and has no runtime dependencies:

```powershell
node --test
node bin/agentrouter.js doctor --quick
```

Read first:

- `AGENTS.md` — invariants and commands
- `docs/STATUS.md` — what is verified and what is not
- `docs/VERIFICATION.md` — exact commands and observed output
- `docs/agentrouter-adapter-spec.md` — protocol mapping and risks

A good next task is the one gap that cannot be closed here: verify the real Claude Desktop app and adjust `inferenceModels` or the base URL if Windows behaves differently.

## 9. Undo everything

```powershell
agentrouter undo
```

Removes the desktop profile (restoring `_meta.json`), autostart entry, launcher links and the user PATH entry. Add `--purge` to delete the key and logs as well.

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `install.ps1 cannot be loaded because running scripts is disabled` | PowerShell execution policy | Use `scripts\install.cmd`, or `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1` |
| `Node.js 20 or newer was not found` | Node missing, too old, or installed after the shell opened | `winget install OpenJS.NodeJS.LTS`, then open a **new** PowerShell |
| `cc-agent: "claude" was not found in PATH` | Claude Code not installed, or `npm`'s global folder is not on PATH | `npm install -g @anthropic-ai/claude-code`, reopen the terminal. The launcher also checks `%APPDATA%\npm`, `%USERPROFILE%\.local\bin` and `%LOCALAPPDATA%\Programs\claude` |
| `spawn EINVAL` when starting Claude Code or Codex | Node refuses to spawn `.cmd` shims directly (CVE-2024-27980, Node 20.12+). Fixed by routing shims through `cmd.exe`; an old installed copy still shows it | Reinstall with the current `install.ps1` so the fixed `src\launch.js` is in place |
| `claude` starts but reports `There's an issue with the selected model` | The request reached AgentRouter with a model it does not serve | `agentrouter models` to list valid IDs; `cc-agent -m <id>` |
| Claude Code exits immediately after `agentrouter` starts | A stale `ANTHROPIC_API_KEY`, OAuth token or Bedrock/Vertex switch was inherited | `cc-agent` strips all of them for its child process; check `cc-agent --dry-run` shows your model and `http://127.0.0.1:<port>` |
| `Port 8787 is already in use` | Another bridge or app | `agentrouter serve --port 8788`, or stop the other process |
| A guide or error says WSL is required | Outdated advice, or Claude Code was installed with the Linux installer inside a WSL-only shell | Install natively: `irm https://claude.ai/install.ps1 | iex`, then run `agentrouter doctor`; WSL is only needed for Claude Code's sandbox mode |
| `Claude Code on Windows requires either Git for Windows (for bash) or PowerShell` | Neither shell was found | Add `%SystemRoot%\System32\WindowsPowerShell\v1.0` to PATH, or install Git for Windows (`winget install --id Git.Git -e`) |
| Claude Code says it cannot find Git Bash | Git installed outside PATH and the default folders | `agentrouter doctor` shows the detected path; otherwise set `CLAUDE_CODE_GIT_BASH_PATH` to `C:\Program Files\Git\bin\bash.exe` |

Diagnostics: `agentrouter status`, `agentrouter doctor --quick`, then
`%APPDATA%\agentrouter\logs\agentrouter.log`.

## Notes

- No administrator rights are required at any point.
- `npm install -g .` from the clone also works; npm writes its own `.cmd` shims to `%APPDATA%\npm`. `agentrouter undo` only removes what `install.ps1` created.
- If port 8787 is taken by another tool, `agentrouter serve --port 8788` and `agentrouter desktop on --port 8788` use a free port; the desktop entry records the actual port.
