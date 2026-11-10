# Security

## What AgentAdapter stores

| Secret | Location | Protection |
|---|---|---|
| AgentRouter API key | `~/.config/agentrouter/credentials.json` (Windows: `%APPDATA%\agentrouter\`) | `0600`, directory `0700`, user ACL on Windows |
| Local bridge token | `~/.config/agentrouter/config.json` | `0600`, random 32 bytes |
| Claude Desktop credential | Claude 3P profile | the **local** token, not the AgentRouter key |
| Codex credential | environment only (`AGENTROUTER_LOCAL_TOKEN`) | not written to `~/.codex` |

The bridge token is passed to Claude Code and Codex as an environment variable. The real API key is used only by the bridge process.

## Network exposure

- The bridge binds to `127.0.0.1`, never `0.0.0.0`.
- Every route except `/healthz` requires `Authorization: Bearer <local token>` or `x-api-key`.
- Comparison uses `crypto.timingSafeEqual`.
- There is no TLS because traffic never leaves the machine. The upstream connection to `agentrouter.org` uses HTTPS.

Any local process that can read your config file can read the token. That is the same trust boundary as your shell; do not run untrusted code as the same user.

## Logging

`agentrouter.log` contains timestamps, routes, model IDs, HTTP status, token counts and durations. It does **not** contain prompts, tool results, API keys or local tokens. Secret-shaped strings are additionally redacted before writing.

## Repository hygiene

`.gitignore` excludes `credentials.json`, `changes.json`, `install.json`, logs, pid files and model caches. CI and tests never use a real key; the server tests use a fake upstream.

Before committing, the project was scanned for `sk-` key material. If you contribute, do not paste keys into issues, commits or test fixtures.

## If a key leaks

1. Revoke it in the AgentRouter dashboard.
2. Create a new key.
3. Run `agentrouter login` again.
4. If it was committed, rewrite history before publishing; deleting the file in a later commit is not enough.

## Reporting

Open a private security advisory on GitHub or contact the maintainer. Do not include working keys, full prompts or personal paths in a public issue.

## Termux caveat

Codex runs without its Bubblewrap sandbox on Termux/PRoot because the sandbox cannot execute there. Codex therefore has the same file access as your shell. Only run prompts and repositories you trust. Set `AGENTROUTER_CODEX_SANDBOX=1` to keep your own sandbox flags and accept that file writes may fail.
