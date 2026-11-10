# Windows: install and work on AgentAdapter while OmniRoute keeps routing

This guide assumes Claude Code is currently routed through OmniRoute or CC-Switch to NVIDIA. You do **not** need to switch that off to clone or develop AgentAdapter.

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

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

The installer:

- copies the app to `%LOCALAPPDATA%\Programs\agentrouter`
- creates `agentrouter.cmd`, `cc-agent.cmd`, `codex-agent.cmd`
- adds that folder to the **user** PATH (no admin, no machine-wide change)
- records the change in `%APPDATA%\agentrouter\install.json` for `agentrouter undo`

Open a **new** PowerShell window so the PATH is visible.

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
- `CLAUDE_CODE_MAX_CONTEXT_TOKENS=200000`

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

## Notes

- No administrator rights are required at any point.
- If PowerShell blocks the script, use `Set-ExecutionPolicy -Scope Process Bypass` as shown; this affects only the current window.
- If `node` is not on PATH after installation, install Node 20+ from nodejs.org and reopen PowerShell.
- If port 8787 is taken by another tool, `agentrouter serve --port 8788` and `agentrouter desktop on --port 8788` use a free port; the desktop entry records the actual port.
