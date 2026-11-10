# AgentAdapter — instructions for coding agents

This repository is a zero-dependency Node.js bridge that runs Claude Code and Codex CLI against AgentRouter. Read `docs/STATUS.md` before changing behavior; it separates what is verified from what is only implemented.

## Invariants

1. **Never commit an API key.** The key lives in `~/.config/agentrouter/credentials.json` (or `%APPDATA%`). Tests must use the fake upstream in `test/server.test.js`.
2. **Do not edit CC-Switch, `~/.claude` or `~/.codex`.** Codex runs with an isolated `CODEX_HOME`; the desktop profile has its own ID and a backup.
3. **Default to stable mode.** Tools plus reasoning over AgentRouter's Anthropic path returns 400; the bridge must use `/v1/responses`.
4. **Loopback only.** The server must stay on `127.0.0.1` and require the local token on every route except `/healthz`.
5. **No new runtime dependencies** without a concrete reason. Node 20+ built-ins are sufficient.
6. **Android has no background service.** `cc-agent`/`codex-agent` own the bridge lifetime and must stop it on exit.
7. **Log without content.** Model, status, tokens and timings only. Prompts and tool output stay out of logs.

## Commands

```bash
node --test
node bin/agentrouter.js doctor --quick
node bin/agentrouter.js doctor
node bin/agentrouter.js status --json
```

Live tests spend API credits. Use `doctor --quick` for a cheap check, and a single short prompt for launcher changes.

## Layout

| Path | Responsibility |
|---|---|
| `src/translate.js` | Anthropic ↔ Responses conversion, SSE state machine |
| `src/server.js` | HTTP routes, auth, streaming, Responses passthrough |
| `src/agent.js` | shared `cc-agent` / `codex-agent` flow |
| `src/launch.js` | environment construction, Codex config, process spawning |
| `src/desktop.js` | Claude Desktop 3P profile and `_meta.json` backup |
| `src/doctor.js` | live diagnostics |
| `src/undo.js` | reverses recorded changes |
| `docs/agentrouter-adapter-spec.md` | protocol mapping and design rationale |

## Verification expectations

- Run `node --test` after any change. It must stay green.
- For a behavior change, run the affected live path and record the exact command and observed output in `docs/VERIFICATION.md`.
- If a check cannot run (Windows, real Claude Desktop), say so explicitly in `docs/STATUS.md`; do not mark it verified.
- When fixing a bug, add a regression test where the logic is testable without the network.

## Open work

The honest gap list is at the end of `docs/STATUS.md`. The highest-value next step is a real Claude Desktop run on Windows, followed by the Windows installer and autostart. Prompt-cache translation and `--full` validation are separate, lower-priority tasks.
