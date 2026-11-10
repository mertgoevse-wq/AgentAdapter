# Status

Last updated: 2026-11-10
Environment: Debian 13 aarch64 (PRoot/Termux-like), Node 24.22.1, Claude Code 2.1.319, Codex CLI 0.165.0.

This file is deliberately blunt. "Implemented" means the code exists and its unit tests pass. "Verified" means it was executed here and the observed result is recorded in [`VERIFICATION.md`](VERIFICATION.md). "Not tested" means exactly that.

## Verification matrix

| Capability | Android/Termux | Linux desktop | Windows |
|---|---|---|---|
| Key login + protected storage | Verified (`0600`) | Same code path | Implemented, not run |
| Live model list | Verified (3 models) | Same code path | Implemented, not run |
| Client-gate detection | Verified (plain client 401) | Same code path | Implemented, not run |
| Anthropic → Responses translation | Verified live | Same code path | Same code path |
| Tool calls + reasoning | Verified (`function_call`) | Same code path | Same code path |
| Streaming | Verified (Claude Code output, unit tests) | Same code path | Same code path |
| `cc-agent` + Claude Code | Verified: text, file creation, execution | Same code path | Implemented, not run |
| `codex-agent` + Codex | Verified: text, file creation, execution | Same code path | Implemented, not run |
| Isolated `CODEX_HOME` | Verified (`~/.codex` hash unchanged) | Same code path | Implemented, not run |
| Interactive model menu | Verified | Same code path | Implemented, not run |
| Piped menu fallback | Verified (`gpt-6-astra`) | Same code path | Implemented, not run |
| Local token enforcement | Verified (wrong token 401) | Same code path | Same code path |
| `count_tokens` | Verified (local estimate) | Same code path | Same code path |
| `doctor` | Verified (all required checks) | Same code path | Implemented, not run |
| Desktop profile write/restore | Verified against a simulated config library | Same code path | Implemented, not run |
| Real Claude Desktop app | **Not tested** (app unavailable) | **Not tested** | **Not tested** |
| Installer | Verified (`install.sh`, launcher, undo) | Same code path | `install.ps1` executed under PowerShell 7.4 on Linux with emulated `%APPDATA%`/`%LOCALAPPDATA%`; **not run on Windows hardware** |
| Windows `.cmd` launch | n/a | n/a | Fixed (cmd.exe wrapper) and unit-tested; the real spawn runs in the `windows-latest` CI job, not on hardware |
| Autostart | Intentionally refused on Termux | systemd/profile code implemented, not run | Registry code implemented, not run |
| `undo` | Verified for install + desktop | Same code path | Implemented, not run |
| `--full` reasoning mode | Not tested live | Not tested | Not tested |

The 18 unit tests also run in GitHub Actions on `ubuntu-latest` and `windows-latest` with Node 20, 22 and 24. All six jobs passed on commit `0d56960`. That covers cross-platform unit code (paths, translation, HTTP server, sandbox rule), not the Windows installer or live API calls.

## Bugs found during verification (and fixed)

1. **`doctor` counted optional warnings as failures.** Desktop not installed, autostart off and "no background bridge on Android" made the command exit 1. Fixed: only required failures affect the exit code.
2. **Desktop folder check was unreachable.** The code created `configLibrary` before checking whether `Claude-3p` existed, so a missing app looked fine. Fixed: check the root first, then create.
3. **Codex file writes failed under Termux/PRoot.** Bubblewrap returned exit 182 for writes and commands. Fixed: `codex-agent` injects `--dangerously-bypass-approvals-and-sandbox` on Termux unless the user passed their own sandbox flag; warning printed; opt-out via `AGENTROUTER_CODEX_SANDBOX=1`.
4. **Desktop shutdown logic was inverted.** `desktop off` only stopped the daemon when it was *not* running. Fixed: always stop the recorded daemon.
5. **Test fixture represented an Anthropic-only model with an empty endpoint list**, which the filter intentionally treats as "unknown". Fixed the fixture to `["anthropic"]`; the production filter is unchanged.
6. **Windows: Claude Code and Codex could not be started at all.** Node 20.12+ refuses to spawn `.cmd`/`.bat` files without `shell: true` (CVE-2024-27980), and npm installs both CLIs as `.cmd` shims, so `cc-agent` died with `spawn EINVAL`. Fixed: `src/launch.js` resolves the shim (PATH, `%APPDATA%\npm`, `%USERPROFILE%\.local\bin`, `%LOCALAPPDATA%\Programs\claude`, PATHEXT order) and runs batch files through `cmd.exe /d /s /c` with quoted arguments. `doctor` uses the same resolver, so it no longer reports an installed CLI as missing on Windows.
7. **Windows: stale credentials could bypass the bridge.** `claudeEnvironment` now removes `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_PROFILE` and the Bedrock/Vertex switches from the child process, and pins `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` to the selected AgentRouter model so Claude Code's background requests stop asking for Claude model IDs.
8. **Windows: the bridge could be left running.** `cc-agent` forwarded `SIGINT` to the child on Windows, where signals are not supported and the console already delivers Ctrl+C; the process could exit before stopping the bridge. Fixed: on Windows the handler only keeps the launcher alive, and `taskkill /T /F` ends the process tree in `stopService`/`stopDaemon`.
9. **Windows: `undo` did not remove the launchers.** They are regular `.cmd` files, not symlinks, so `removeIfOurs` skipped them. Fixed: recorded launcher files inside the install directory are removed.
10. **Windows: installer failed without a clear reason.** `install.ps1` now resolves Node (including `%ProgramFiles%\nodejs`, nvm and `AGENTROUTER_NODE`), writes wrappers with the absolute Node path, verifies `agentrouter version`, and prints the failing line instead of a bare error. `scripts\install.cmd` avoids the execution-policy prompt, and `scripts\bootstrap.ps1` installs from a download without a clone.

## Built

- Zero-dependency Node.js bridge (`http`, `fetch`, `crypto`) on `127.0.0.1`.
- Anthropic Messages → OpenAI Responses translation: system blocks, text, images, `tool_use`, `tool_result`, tools, `tool_choice`, `max_tokens`, reasoning effort, metadata.
- Responses → Anthropic translation for streaming and non-streaming, including tool argument deltas, usage and stop reasons.
- `cc-agent` and `codex-agent`: live model menu, `-m`, `--list`, `--dry-run`, `--no-service`, `--full`, argument passthrough.
- Ephemeral bridge on Android; background service with pid file for desktop use.
- `agentrouter` commands: `login`, `models`, `setup`, `serve`, `status`, `doctor`, `desktop`, `autostart`, `undo`, `version`.
- Claude Desktop 3P profile with a dedicated ID, explicit model entries, `_meta.json` backup and restore.
- Windows installer with user PATH, absolute-Node `.cmd` wrappers, `install.cmd` and a `bootstrap.ps1` one-liner; Linux/Termux installer with symlinks and profile PATH.
- Windows launcher that runs `.cmd` shims through `cmd.exe` instead of failing with `spawn EINVAL`.
- 29 unit tests (11 Windows-specific: shim resolution, cmd quoting, Claude Code environment, real `.cmd` spawn on Windows runners).
- JSONL logging with rotation and key redaction.
- 18 unit tests with a fake upstream; no network required.

## Not built

- **A real Claude Desktop integration test.** There is no Claude Desktop app on this Android device. The profile format follows the vendor documentation and the write/restore round-trip was tested; the app itself was not launched.
- **Windows execution.** No Windows machine in this environment. `install.ps1` was executed under PowerShell 7.4 on Linux (emulated AppData paths) but not on Windows; the registry autostart, the `.cmd` wrappers and the `cmd.exe` launcher are implemented and unit-tested, with the real `.cmd` spawn covered by the `windows-latest` CI job only.
- **Linux systemd autostart.** The code detects `systemctl --user`, but this PRoot image has no systemd, so the unit was never started.
- **Prompt-cache preservation.** Claude Desktop sends `cache_control`; the bridge drops those fields when translating to Responses. Requests work, but upstream prompt caching is not preserved.
- **A `developer`/`full` mode validation.** `--full` forwards reasoning and Anthropic beta fields, but only `stable` was tested live.
- **`/v1/chat/completions`.** Not proxied; AgentRouter's GPT models reject tools there anyway.
- **npm publication.** Install from the repository, not from a registry.
- **GUI.** Terminal only.
- **Desktop app control.** The bridge writes configuration; it does not launch or terminate Claude Desktop (except the optional Windows `--restart` path, which is untested).
- **macOS.** Paths exist in the code, nothing was executed.

## Known limitations

- Upstream client identification is hard-coded to `claude-cli/2.1.319`. If AgentRouter changes its gate, `doctor` will show it and the constant must be updated.
- The bridge is stateless. Reasoning context is not carried between separate HTTP requests; the stable mode keeps reasoning effort low. This is intentional and necessary for Claude Code's request pattern.
- On Termux, Codex runs without its sandbox because Bubblewrap cannot operate in PRoot. This gives Codex the same file access as your shell. Do not run untrusted prompts.
- Claude Desktop may ignore non-Claude model IDs in some versions. `desktop on` writes explicit entries; if the picker stays empty, the fallback is a virtual model alias, which is not implemented.
- Model list is fetched live for every launcher start. Offline use is not supported.
- The `claude-code:unrecognized_model` telemetry line still appears in Claude Code's stderr even with `CLAUDE_CODE_MAX_CONTEXT_TOKENS`; it is cosmetic.

## Next verification steps (in order)

1. Run `agentrouter desktop on` on Windows with Claude Desktop installed; confirm the picker lists `gpt-5.6-sol` and that Chat/Cowork/Code work.
2. Run `agentrouter desktop off`, switch CC-Switch back to NVIDIA, confirm the previous route works; then switch again.
3. Run `scripts\install.cmd` on Windows, open a new PowerShell, run `agentrouter doctor` and then `cc-agent` and `codex-agent`.
4. Test `agentrouter autostart on` with the Windows registry and after a reboot.
5. Test `cc-agent --full` and compare behavior against stable.
6. If prompt caching matters, translate `cache_control` to the Responses equivalent or document the cost.
