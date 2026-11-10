# Claude Desktop

Claude Desktop can use a third-party gateway that implements the Anthropic Messages API. AgentAdapter provides that gateway locally and translates to AgentRouter's Responses endpoint.

## Requirements

- Claude Desktop installed and started at least once.
- Developer mode enabled once: **Help → Troubleshooting → Enable developer mode**.
- A running AgentAdapter bridge on `127.0.0.1`.
- An AgentRouter key stored with `agentrouter login`.

Claude Desktop is not available on Android. The commands still run there, but `desktop on` stops with a clear message because `~/.config/Claude-3p` does not exist.

## What `agentrouter desktop on` does

1. Starts the bridge on the configured port (8787 by default) and keeps it in the background.
2. Reads the existing `_meta.json`, if present, and copies it to `~/.config/agentrouter/backups/desktop-<timestamp>/`.
3. Writes a dedicated profile:

```json
{
  "inferenceProvider": "gateway",
  "inferenceCredentialKind": "static",
  "inferenceGatewayBaseUrl": "http://127.0.0.1:8787",
  "inferenceGatewayApiKey": "<local bridge token>",
  "inferenceGatewayAuthScheme": "bearer",
  "inferenceModels": [
    { "name": "gpt-5.6-sol" },
    { "name": "gpt-6-astra" },
    { "name": "gpt-6.1-sol" }
  ],
  "inferenceStreamIdleTimeoutSec": 600
}
```

4. Sets `appliedId` in `_meta.json` to the AgentAdapter profile ID, preserving every other field.
5. Prints the restart instruction.

The profile ID is `6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42`. It is intentionally different from CC-Switch's profile ID, so both tools can coexist.

## Paths

| OS | Config library |
|---|---|
| Windows | `%LOCALAPPDATA%\Claude-3p\configLibrary\` |
| Linux | `~/.config/Claude-3p/configLibrary/` |
| macOS | `~/Library/Application Support/Claude-3p/configLibrary/` |

Older Windows builds may use `%APPDATA%\Claude-3p`; check which folder exists.

## Restart

Claude Desktop reads this configuration only at startup. Quit it completely, including the tray icon, then reopen it. Closing the window is not enough.

## Models

`inferenceModels` is an **array of objects**, not strings:

```json
[{ "name": "gpt-5.6-sol" }]
```

Explicit entries are required because Claude Desktop's gateway discovery only recognises model IDs that look like Claude models. AgentRouter's GPT IDs would otherwise be filtered out.

If the app still refuses non-Claude IDs, the next option is a virtual alias mapping (for example exposing `claude-sonnet-4-5` and translating it to `gpt-5.6-sol`). That fallback is **not implemented**; the default remains real model names.

## Verify

```bash
agentrouter desktop status
agentrouter status
agentrouter doctor
```

`desktop status` should report `Ours: yes` and the three models. `doctor` checks the local `/v1/messages` path, tools and token counting.

## Switch back to CC-Switch

```bash
agentrouter desktop off
```

This deletes only AgentAdapter's profile, restores the backed-up `_meta.json` and keeps CC-Switch's files untouched. Restart Claude Desktop afterwards.

## Troubleshooting

| Symptom | Check |
|---|---|
| Picker empty | Full restart; `desktop status`; developer mode enabled |
| Requests fail with 401 | Bridge token differs from the profile; rerun `desktop on` |
| "Gateway unreachable" | `agentrouter status`; start `agentrouter serve` |
| App ignores the profile | Confirm the config library path for your OS/version |
| Profile missing after update | Claude Desktop recreates the folder; rerun `desktop on` |

## What is not proven

The file round-trip (write, backup, restore, delete) was tested against a simulated config library. The real app was not available on the Android test device. The vendor documentation specifies `inferenceModels` as objects with `name`, `supports1m` and `behavesAs`; this implementation uses `name` only.

The gateway base URL is written without `/v1`, matching the documented "full URL of the inference gateway endpoint" and the Anthropic Messages path the app appends. If a specific desktop version expects `/v1` in the value, change `inferenceGatewayBaseUrl` to `http://127.0.0.1:8787/v1`; the bridge accepts both `/v1/messages` and `/messages`.
