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
| Installer | Verified (`install.sh`, launcher, undo) | Same code path | `install.ps1` not run |
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

## Built

- Zero-dependency Node.js bridge (`http`, `fetch`, `crypto`) on `127.0.0.1`.
- Anthropic Messages → OpenAI Responses translation: system blocks, text, images, `tool_use`, `tool_result`, tools, `tool_choice`, `max_tokens`, reasoning effort, metadata.
- Responses → Anthropic translation for streaming and non-streaming, including tool argument deltas, usage and stop reasons.
- `cc-agent` and `codex-agent`: live model menu, `-m`, `--list`, `--dry-run`, `--no-service`, `--full`, argument passthrough.
- Ephemeral bridge on Android; background service with pid file for desktop use.
- `agentrouter` commands: `login`, `models`, `setup`, `serve`, `status`, `doctor`, `desktop`, `autostart`, `undo`, `version`.
- Claude Desktop 3P profile with a dedicated ID, explicit model entries, `_meta.json` backup and restore.
- Windows installer with user PATH and `.cmd` wrappers; Linux/Termux installer with symlinks and profile PATH.
- JSONL logging with rotation and key redaction.
- 18 unit tests with a fake upstream; no network required.

## Not built

- **A real Claude Desktop integration test.** There is no Claude Desktop app on this Android device. The profile format follows the vendor documentation and the write/restore round-trip was tested; the app itself was not launched.
- **Windows execution.** No Windows machine in this environment. `install.ps1`, the registry autostart and `%LOCALAPPDATA%` paths are implemented but unexecuted.
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
3. Run `scripts/install.ps1` on Windows, open a new PowerShell, run `cc-agent` and `codex-agent`.
4. Test `agentrouter autostart on` with the Windows registry and after a reboot.
5. Test `cc-agent --full` and compare behavior against stable.
6. If prompt caching matters, translate `cache_control` to the Responses equivalent or document the cost.
