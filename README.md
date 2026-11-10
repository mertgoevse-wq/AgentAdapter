# AgentAdapter

**Claude Code, Codex CLI and Claude Desktop on AgentRouter models.**

AgentAdapter is a small local bridge that speaks Anthropic Messages to your tools and OpenAI Responses to AgentRouter. It also sends the client identification AgentRouter expects, which neither Codex nor Claude Desktop sends on their own.

[![tests](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml/badge.svg)](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Languages:** English · [Deutsch](docs/i18n/README.de.md) · [Français](docs/i18n/README.fr.md) · [Español](docs/i18n/README.es.md) · [Português](docs/i18n/README.pt.md) · [Türkçe](docs/i18n/README.tr.md) · [हिन्दी](docs/i18n/README.hi.md) · [中文](docs/i18n/README.zh-CN.md)

---

## Why this exists

AgentRouter exposes an Anthropic-compatible endpoint, but three measured details make a direct connection unusable for agentic work:

| Observation | Consequence |
|---|---|
| `/v1/messages` with tools **and** reasoning returns `400` ("use `/v1/responses`") | Claude Code cannot use its tools through the Anthropic path |
| Codex CLI and Claude Desktop receive `401 unauthorized client` | They must not talk to AgentRouter directly |
| `/v1/responses` accepts function tools, reasoning and streaming | This is the path that works |

AgentAdapter translates requests instead of merely forwarding them:

```
Claude Code ──Anthropic Messages──┐
Codex CLI ────OpenAI Responses───┼──► 127.0.0.1:8787 ──► agentrouter.org/v1/responses
Claude Desktop ──Anthropic───────┘        bridge
```

The bridge binds to loopback only, requires a local token, and keeps the real API key out of every client configuration.

---

## What runs today

| Area | Android / Termux | Windows / Linux desktop |
|---|---|---|
| Claude Code via `cc-agent` | **Verified live**: text, tools, file creation, execution | Implemented, not run on Windows hardware |
| Codex CLI via `codex-agent` | **Verified live**: text, tools, file creation | Implemented, not run on Windows hardware |
| Live model menu | Verified (interactive and piped) | Implemented |
| Claude Desktop profile | Not applicable; app unavailable here | Profile write/restore **verified with a simulated config library**; real app not tested |
| Background service + autostart | Deliberately unavailable (on-demand only) | Implemented, not tested on Windows |
| One-command undo | Verified for launchers; desktop/autostart paths implemented | Implemented, not tested on Windows |

Full evidence and gaps: [`docs/STATUS.md`](docs/STATUS.md) and [`docs/VERIFICATION.md`](docs/VERIFICATION.md).

---

## Requirements

- **Node.js 20 or newer** (tested with 24.22.1)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`) and/or **Codex CLI** (`npm install -g @openai/codex`)
- An **AgentRouter API key** with access to at least one model
- Claude Desktop only if you want the desktop integration

No runtime npm dependencies. The bridge uses Node's built-in `http`, `fetch` and `crypto`.

---

## Install

### Android / Termux

```bash
pkg install nodejs git
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
bash scripts/install.sh
```

Open a new shell, then:

```bash
agentrouter login
cc-agent
codex-agent
```

On Android, `cc-agent` and `codex-agent` start the bridge only for the lifetime of the session. Nothing keeps running in the background.

Codex's Bubblewrap sandbox does not work under Termux/PRoot. `codex-agent` detects this and runs Codex with its sandbox disabled, printing a warning. Set `AGENTROUTER_CODEX_SANDBOX=1` to keep your own Codex flags unchanged.

### Linux desktop

```bash
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
bash scripts/install.sh
agentrouter login
cc-agent
```

For Claude Desktop, keep a bridge running:

```bash
agentrouter autostart on     # systemd user unit, or ~/.profile fallback
agentrouter desktop on       # writes a separate profile, then restart the app
```

### Windows

Without a clone:

```powershell
irm https://raw.githubusercontent.com/mertgoevse-wq/AgentAdapter/main/scripts/bootstrap.ps1 | iex
```

From a clone (any of these):

```powershell
.\scripts\install.cmd
```

```powershell
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Open a **new** PowerShell window, then:

```powershell
agentrouter login
cc-agent
codex-agent
agentrouter desktop on
```

The installer uses `%LOCALAPPDATA%\Programs\agentrouter`, adds that folder to your **user** PATH, and needs no administrator rights. It finds Node 20+ itself, calls Node by absolute path from the `.cmd` wrappers, verifies the installed copy, and reports whether Claude Code, Codex and Git Bash are present.

**Native Windows only — WSL is never required.** Everything runs from PowerShell or CMD. Claude Code has a native Windows build:

```powershell
irm https://claude.ai/install.ps1 | iex     # or: winget install Anthropic.ClaudeCode
winget install --id Git.Git -e              # optional, enables the Bash tool
```

AgentAdapter finds `claude.exe` in `%USERPROFILE%\.local\bin`, the npm shim in `%APPDATA%\npm` and anything on PATH, and passes `CLAUDE_CODE_GIT_BASH_PATH` when Git Bash is installed. Without Git for Windows, Claude Code uses its PowerShell tool. Only Claude Code's sandbox mode needs WSL 2.

Claude Code and Codex are `.cmd` shims on Windows, which Node refuses to spawn directly since 20.12 (`spawn EINVAL`). The launchers resolve the shim and run it through `cmd.exe`, so `cc-agent` and `codex-agent` start them correctly.

Detailed coexistence with OmniRoute and CC-Switch: [`docs/WINDOWS.md`](docs/WINDOWS.md).

---

## First run

`agentrouter login` asks for the key with hidden input, validates it against AgentRouter, and stores it at:

- Linux/Termux: `~/.config/agentrouter/credentials.json` (`0600`)
- Windows: `%APPDATA%\agentrouter\credentials.json`

Then `cc-agent` shows the live model list:

```
Claude Code model  ↑/↓, Enter, q
❯ gpt-5.6-sol        last used
  gpt-6-astra
  gpt-6.1-sol
```

Enter starts Claude Code with that model. `-m <id>` skips the menu; `--list` prints the list for scripts.

---

## Commands

| Command | Purpose |
|---|---|
| `agentrouter login` | Store and validate the API key |
| `agentrouter models` | Live model list (`--json`) |
| `agentrouter setup` | Guided setup; optionally `--desktop` / `--autostart` |
| `agentrouter serve` | Run the bridge in the foreground (`--port`, `--mode`) |
| `agentrouter status` | Key, bridge, mode, desktop and autostart state |
| `agentrouter doctor` | End-to-end diagnostics (`--json`, `--quick`) |
| `agentrouter desktop on\|off\|status` | Manage the Claude Desktop profile |
| `agentrouter autostart on\|off` | Login autostart (not on Termux) |
| `agentrouter undo` | Revert every recorded change (`--purge` removes key and logs) |
| `cc-agent` | Model menu, then Claude Code |
| `codex-agent` | Model menu, then Codex in an isolated `CODEX_HOME` |

Both launchers pass unknown arguments through: `cc-agent -m gpt-5.6-sol -p "..."`, `codex-agent exec --skip-git-repo-check "..."`.

---

## Claude Desktop

Claude Desktop reads third-party inference settings only at startup. AgentAdapter writes a profile with its own ID and never edits CC-Switch profiles.

```bash
agentrouter desktop on
# quit Claude Desktop completely, including the tray icon, then reopen it
```

What is written:

- Linux: `~/.config/Claude-3p/configLibrary/`
- Windows: `%LOCALAPPDATA%\Claude-3p\configLibrary\`
- macOS: `~/Library/Application Support/Claude-3p/configLibrary/`
- Profile ID: `6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42`
- Gateway: `http://127.0.0.1:8787`
- Models: explicit entries, because Claude Desktop's auto-discovery only accepts recognisably Claude model IDs

`agentrouter desktop off` removes the profile and restores the previous `_meta.json`, so CC-Switch can take over again. Details and troubleshooting: [`docs/CLAUDE-DESKTOP.md`](docs/CLAUDE-DESKTOP.md).

> **Not yet verified against the real desktop app.** The profile round-trip was tested against a simulated config library. The exact `inferenceModels` schema and app behaviour on Windows still need one run on a machine with Claude Desktop installed.

---

## Windows while OmniRoute or CC-Switch is routing

AgentAdapter does not edit `~/.claude/settings.json`, `~/.codex/config.toml` or CC-Switch's files.

- A normal `claude` session keeps using OmniRoute/NVIDIA.
- `cc-agent` sets `ANTHROPIC_BASE_URL` and the model **only for its own child process**.
- `codex-agent` uses its own `CODEX_HOME` under `%LOCALAPPDATA%\agentrouter\codex`; your normal Codex history and provider stay untouched.
- The desktop profile is separate from CC-Switch's profile; `desktop off` restores the previous `appliedId`.

So you can clone the repository and work on AgentAdapter itself with Claude Code, while Claude Code is still routed through OmniRoute. See [`docs/WINDOWS.md`](docs/WINDOWS.md) for the exact sequence.

---

## Security

- The API key never enters the repository, the desktop profile, Codex config or process arguments.
- The bridge listens on `127.0.0.1` only and requires a random local token (`0600` config file).
- Upstream requests always use a Claude CLI user agent and `x-app: cli`; this is what AgentRouter accepts.
- Logs contain model, status, token counts and timings — never prompts, tool output or keys.
- The desktop profile stores the **local bridge token**, not the AgentRouter key.
- If a key was ever pasted into a chat, issue or commit, rotate it in AgentRouter.

More: [`SECURITY.md`](SECURITY.md).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 unauthorized client detected` | Upstream client gate changed, or a client bypassed the bridge | Run `agentrouter doctor`; update AgentAdapter |
| `400 Function tools with reasoning_effort are not supported` | Request went through the Anthropic path | Keep the default `stable` mode; the bridge uses `/v1/responses` |
| Claude Desktop model picker is empty | App was not fully restarted, or profile not applied | Quit tray icon, reopen, check `agentrouter desktop status` |
| `codex` exits 182 on Termux | Bubblewrap sandbox unavailable in PRoot | `codex-agent` disables it automatically; do not pass `-s workspace-write` |
| `Port 8787 is already in use` | Another bridge or app | `agentrouter serve --port 8788`, or stop the old process |
| `claude: not found` | CLI not installed | `npm install -g @anthropic-ai/claude-code` |
| `spawn EINVAL` on Windows | Node refuses to spawn a `.cmd` shim directly | Update to the current version; `cc-agent`/`codex-agent` route shims through `cmd.exe` |
| `install.ps1 cannot be loaded because running scripts is disabled` | PowerShell execution policy | `scripts\install.cmd`, or `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1` |
| Everything works but a guide says "install WSL" | Outdated advice | Native Windows is supported: `irm https://claude.ai/install.ps1 | iex`. Only Claude Code's sandbox mode needs WSL 2 |
| Model list is empty | Key has no OpenAI-compatible models | Check the key's group in AgentRouter |

Logs: `~/.config/agentrouter/logs/agentrouter.log` (`%APPDATA%\agentrouter\logs` on Windows). `agentrouter doctor` is the fastest first step.

---

## Development

```bash
node --test          # 18 unit tests, no network
node bin/agentrouter.js doctor
node bin/agentrouter.js doctor --quick
```

Layout:

```
bin/            CLI entry points
src/translate.js  Anthropic ↔ Responses conversion and SSE state machine
src/server.js     loopback HTTP bridge
src/agent.js      shared launcher logic for cc-agent / codex-agent
src/desktop.js    Claude Desktop 3P profile with backup/restore
src/doctor.js     live diagnostics
test/             node:test suites with a fake upstream
docs/             status, verification log, Windows and Desktop guides, spec
```

The original design document is [`docs/agentrouter-adapter-spec.md`](docs/agentrouter-adapter-spec.md). It documents the measured upstream behaviour, the protocol mapping and the remaining risks.

See [`AGENTS.md`](AGENTS.md) if you continue this project with Claude Code or another coding agent.

---

## Status and limitations

Working and verified on Android/Termux: authentication, live models, Claude Code with tools, Codex with tools, streaming, model menu, local token enforcement, diagnostics, desktop-profile mechanics, installer, undo.

Not verified on hardware: Windows installation and autostart, Claude Desktop with the real app, full reasoning mode, Linux systemd autostart.

Not implemented by design: prompt-cache translation, `/v1/chat/completions`, a GUI, publishing to npm, running a background service on Android.

The complete list is in [`docs/STATUS.md`](docs/STATUS.md).

---

## License

MIT. See [`LICENSE`](LICENSE).
