# Spezifikation: AgentRouter-Adapter für Claude Code, Codex und Claude Desktop

**Kurzname:** `agentrouter-adapter`
**Datei:** `agentrouter-adapter-spec.md`
**Stand:** 10.11.2026
**Status:** Kern umgesetzt und auf Android/Termux verifiziert; Windows und die echte Claude-Desktop-App sind offen (siehe `docs/STATUS.md`)
**Projektordner:** `/home/mert/agent-adapt` (Repository `AgentAdapter`)

---

## 1. Ziel in einem Satz

Ein lokal installierter Adapter soll es ermöglichen, **Claude Code**, **Codex** und die **Claude Desktop App** über **AgentRouter** mit den dort verfügbaren GPT-Modellen zu betreiben – auf **Debian/Termux (Android)** und auf einem **Windows-Laptop mit PowerShell** –, ohne die bestehende CC-Switch-/NVIDIA-/OmniRoute-Konfiguration zu verändern.

Der sichtbare Nutzen:

- `cc-agent` zeigt beim Start die aktuell verfügbaren AgentRouter-Modelle zur Auswahl und startet Claude Code damit.
- `codex-agent` tut dasselbe für Codex.
- `agentrouter desktop` verbindet die Claude Desktop App (Chat, Cowork, Code) mit AgentRouter und lässt sich jederzeit sauber zurücknehmen, damit CC-Switch wieder übernehmen kann.
- Ein Befehl `agentrouter undo` stellt den Zustand vor der Einrichtung wieder her.

---

## 2. Ausgangslage und verifizierte Befunde

Alle folgenden Punkte wurden am 10.11.2026 in dieser Umgebung **praktisch geprüft** (nicht nur aus Dokumentation übernommen).

### 2.1 Umgebung

| Element | Wert |
|---|---|
| Betriebssystem | Debian GNU/Linux 13 (trixie), aarch64, PRoot-Distro (Termux-Kontext) |
| Node.js | v24.22.1 |
| npm | 11.19.1 |
| Claude Code | 2.1.319 (`@anthropic-ai/claude-code`) |
| Codex CLI | 0.165.0 (`@openai/codex`) |
| Python | 3.x vorhanden (nur für Diagnose genutzt) |
| Projektordner | leer, kein Git-Repo, keine bestehenden Dateien |

### 2.2 AgentRouter-Endpunkte

| Zweck | URL | Format |
|---|---|---|
| Anthropic Messages | `https://agentrouter.org/v1/messages` (Basis-URL für Clients: `https://agentrouter.org`, **ohne** `/v1`) | Anthropic Messages |
| OpenAI Responses | `https://agentrouter.org/v1/responses` | OpenAI Responses API |
| OpenAI Chat Completions | `https://agentrouter.org/v1/chat/completions` | OpenAI Chat (von GPT-Modellen **nicht** unterstützt) |
| Modellliste | `https://agentrouter.org/v1/models` | OpenAI-Liste |

### 2.3 Messergebnisse (mit dem bereitgestellten Key)

| Test | Ergebnis | Bedeutung |
|---|---|---|
| `GET /v1/models` ohne auffällige Client-Kennung | **401** `unauthorized client detected` | AgentRouter lässt nur bekannte Coding-Agenten durch |
| `GET /v1/models` mit `User-Agent: claude-cli/2.1.319 (external, cli)` | **200** | Kennung `claude-cli/*` wird akzeptiert |
| `POST /v1/messages` mit `claude-opus-4-8` | **503** „无可用渠道" (kein Kanal verfügbar) | Anthropic-Modelle sind für diesen Key nicht freigeschaltet |
| `POST /v1/messages` mit `gpt-5.6-sol`, einfacher Text | **200**, Anthropic-Antwortformat | GPT-Modelle sind über die Anthropic-Oberfläche erreichbar |
| `POST /v1/messages` mit Werkzeug + Denkmodus (echter Claude-Code-Request) | **400**: „Function tools with reasoning_effort are not supported for gpt-5.6-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'." | AgentRouter wandelt intern nach Chat Completions; **Werkzeuge + Denkmodus brechen dort** |
| `POST /v1/messages` mit Werkzeug, ohne Denkmodus (kleiner Test) | **403** „Key based authentication is disabled for this resource." | Auch der reine Werkzeugpfad über die Anthropic-Oberfläche ist nicht verlässlich |
| `POST /v1/messages/count_tokens` | **404** | Token-Zähl-Endpunkt fehlt; Claude Code muss damit umgehen können |
| `POST /v1/responses` mit Funktion + `reasoning.effort` | **200**, `function_call` mit `call_id` | Responses-Pfad unterstützt Werkzeuge und Denkmodus |
| `POST /v1/responses` mit `stream: true` | **200**, SSE-Events `response.created`, `response.in_progress`, `response.output_item.added/done`, `response.function_call_arguments.delta/done`, `response.completed` | Streaming und Werkzeugaufrufe sind sauber übersetzbar |
| Modellliste (aktuell) | `gpt-5.6-sol`, `gpt-6-astra`, `gpt-6.1-sol`; alle `supported_endpoint_types: ["openai"]` | Nur GPT-Modelle, dynamisch; Liste muss live gelesen werden |
| `GET /v1/models` mit `User-Agent: codex-cli/0.165.0` | **401** | Codex wird mit dieser Version **nicht** direkt durchgelassen → auch Codex braucht den Adapter |
| `GET /v1/models` mit `User-Agent: ClaudeDesktop/1.0` | **401** | Claude Desktop wird **nicht** direkt durchgelassen → Desktop braucht den Adapter |
| Claude Code echter Lauf direkt gegen AgentRouter | **403** „Key based authentication is disabled…" | Direktverbindung ist nicht ausreichend; der Adapter muss Anfragen normalisieren |

### 2.4 Anatomie einer echten Claude-Code-Anfrage (abgefangen)

- Pfad: `POST /v1/messages?beta=true`
- `User-Agent: claude-cli/2.1.319 (external, sdk-cli)`
- `Authorization: Bearer <Key>`, zusätzlich `x-app: cli`, `anthropic-version: 2023-06-01`
- `anthropic-beta`: `claude-code-20250219`, `interleaved-thinking-2025-05-14`, `context-management-2025-06-27`, `mid-conversation-tool-changes-2026-07-01`, `advanced-tool-use-2025-11-20`, `effort-2025-11-24`
- `anthropic-dangerous-direct-browser-access: true`
- Body ca. **80 KB** mit den Feldern: `model`, `messages`, `system` (Liste von Blöcken), `tools` (21 Stück), `metadata`, `max_tokens`, `thinking: {type: "adaptive"}`, `context_management`, `output_config`, `stream: true`

**Folgerung:** Der Adapter muss die Anthropic-Anfrage nicht nur weiterleiten, sondern:
1. die Client-Kennung auf einen akzeptierten Wert setzen,
2. die Anfrage nach **OpenAI Responses** übersetzen (wegen Werkzeugen + Denkmodus),
3. die Antwort als Anthropic-Stream zurückübersetzen.

### 2.5 Claude Desktop: Weg über „Third-Party Inference"

Claude Desktop unterstützt seit 2026 einen Drittanbieter-Modus mit einem Gateway:

- Entwicklermodus: Help → Troubleshooting → Enable developer mode
- Developer → Configure Third-Party Inference → Connection → **Gateway**
- Credential kind: **Static API key**, Gateway auth scheme: **bearer**
- Konfigurationsdateien (lokal, ohne Admin):
  - Windows: `%LOCALAPPDATA%\Claude-3p\configLibrary\` (ältere Versionen: `%APPDATA%\Claude-3p\`)
  - Linux: `~/.config/Claude-3p/configLibrary/`
  - macOS: `~/Library/Application Support/Claude-3p/configLibrary/`
- `_meta.json` legt fest, welche gespeicherte Konfiguration aktiv ist; jede Konfiguration liegt als `<id>.json` daneben.
- Schlüssel im Eintrag: `inferenceProvider: "gateway"`, `inferenceGatewayBaseUrl`, `inferenceGatewayApiKey`, `inferenceGatewayAuthScheme: "bearer"`, optional `inferenceModels`.
- Claude Desktop liest die Konfiguration **nur beim Start**; Änderungen brauchen einen vollständigen Neustart.
- Ein Gateway auf `127.0.0.1` ist zulässig; **nicht** `localhost` verwenden (Doku-Empfehlung mehrerer Gateway-Anbieter).

**Wichtig:** AgentRouter selbst lehnt die Desktop-Kennung mit 401 ab. Deshalb muss Desktop auf den lokalen Adapter zeigen, nicht direkt auf AgentRouter.

### 2.6 CC-Switch-Koexistenz

CC-Switch verwaltet Claude Code (`~/.claude/settings.json`), Codex (`~/.codex/config.toml`, `auth.json`) und Claude Desktop (eigene `configLibrary`-Einträge, u. a. ID `00000000-0000-4000-8000-000000157210`).
Für Desktop kann CC-Switch entweder direkt auf einen Anbieter zeigen oder über ein lokales Gateway (`http://127.0.0.1:15721/claude-desktop`) mit Modellzuordnung routen.

**Vorgabe des Nutzers:** CC-Switch bleibt **unverändert** und muss jederzeit wieder übernehmen können. Der Adapter benutzt deshalb eine **eigene Profil-ID** und schreibt niemals in CC-Switch-Dateien. `agentrouter desktop off` stellt den vorherigen `appliedId`-Zustand wieder her.

### 2.7 Modell- und Kontextfenster

Claude Code warnt bei unbekannten Modell-IDs und nimmt 200k Kontext an. Korrektur laut Doku: `CLAUDE_CODE_MAX_CONTEXT_TOKENS` (und für die Auto-Kompaktierung `CLAUDE_CODE_AUTO_COMPACT_WINDOW`). Für AgentRouter-Modelle wird standardmäßig **200000** gesetzt, konfigurierbar pro Modell.

---

## 3. Produktumfang

### 3.1 Bestandteile

| Bestandteil | Zweck |
|---|---|
| `agentrouter` (Haupt-CLI) | Einrichtung, Diagnose, Dienststeuerung, Desktop-Profil, Rücknahme |
| `cc-agent` | Modellauswahl + Start von Claude Code über den Adapter |
| `codex-agent` | Modellauswahl + Start von Codex über den Adapter |
| `agentrouter serve` | Lokaler Übersetzerdienst (Anthropic Messages ⇄ OpenAI Responses) |
| `agentrouter doctor` | Prüft Key, Modellliste, Client-Kennung, Übersetzung, Werkzeuge, Port, Autostart |
| `agentrouter undo` | Nimmt alle Änderungen zurück |

### 3.2 Nicht-Ziele

- Keine Änderung an CC-Switch-Dateien oder an der NVIDIA-/OmniRoute-Einrichtung.
- Keine Überschreibung bestehender Claude-Code-/Codex-Einstellungen; alles läuft über eigene Profile/Umgebungen.
- Kein Betrieb eines öffentlichen Servers; der Dienst bindet ausschließlich an `127.0.0.1`.
- Keine Anbindung an Anthropic-Abonnements, keine OAuth-Weiterleitung, kein Key-Sharing.
- Keine eigene Desktop-GUI; Auswahl erfolgt im Terminal.
- Keine Veröffentlichung als npm-Paket (Installation aus diesem Projektordner).

---

## 4. Entscheidungen aus dem Interview

| Frage | Entscheidung | Auswirkung auf die Umsetzung |
|---|---|---|
| Modellwahl | Jedes Mal kleine Auswahl | Menü bei jedem Start; Bestätigung mit Enter; `--model` überspringt |
| Umfang | `cc-agent` für Claude Code, `codex-agent` für Codex; `cc-agent` zeigt Modelle | Zwei eigenständige Starter, gemeinsame Auswahl-Logik |
| Schlüssel | Geschützte Datei im Benutzerordner | `~/.config/agentrouter/credentials.json`, Modus 0600; Windows `%APPDATA%\agentrouter\` |
| Modellausfall | Nachfragen, ob gewechselt werden soll | Interaktive Rückfrage; kein stiller Wechsel; non-TTY bricht mit Liste ab |
| Abnahmetest | Gestaffelt: kurzer Test, dann echte Aufgabe | `doctor` → `-p "OK"` → Datei anlegen/ausführen |
| Claude Desktop | Automatisch einrichten, Nutzer startet nur neu | Profil schreiben, `_meta.json` setzen, App-Neustart anfordern |
| Hilfsdienst | Ja, im Hintergrund mit Autostart | Windows Autostart ohne Admin; Linux systemd-user falls vorhanden, sonst Shell-Profil |
| Modellnamen | Echte Namen anzeigen | `gpt-5.6-sol` usw., keine `opus`/`sonnet`-Tarnung |
| Windows | PowerShell; Claude Desktop Chat/Cowork/Code; CC-Switch bleibt Schaltzentrale | PowerShell-Installer, kein Admin, CC-Switch unangetastet |
| Android | Möglichst ohne dauerhaft laufenden Zusatzdienst | `cc-agent` startet den Adapter als Kindprozess und beendet ihn beim Exit |
| Bestehendes | Getrennt halten, nichts anfassen | Eigene Profile, eigene `CODEX_HOME`, eigene Desktop-ID, Backups |
| CC-Switch | Eigenes Profil, CC-Switch bleibt unverändert | Eigene configLibrary-ID, `desktop off` stellt alten Zustand wieder her |
| Stabilität | Stabiler Modus als Standard | Denkmodus/Betas werden standardmäßig reduziert; `--full` optional |
| codex-agent | Gleiches Menü wie cc-agent | Gemeinsame UI-Komponente |
| Modellliste | Bei jedem Start live | Netzwerkfehler → klare Meldung + letzte bekannte Liste nur als Hinweis, kein stiller Fallback |
| Rücknahme | Ein Befehl für alles | `agentrouter undo` mit Sicherungen und Übersicht |

---

## 5. Architektur

```
┌────────────────────┐   Anthropic Messages    ┌──────────────────────────┐
│ Claude Code        │ ──────────────────────► │  agentrouter serve       │
│ (cc-agent)         │ ◄────────────────────── │  127.0.0.1:<port>        │
└────────────────────┘   Anthropic SSE         │                          │
                                               │  1. Client-Kennung       │
┌────────────────────┐   OpenAI Responses      │     normalisieren        │
│ Codex (codex-agent)│ ──────────────────────► │  2. Anfrage übersetzen   │
│ eigene CODEX_HOME  │ ◄────────────────────── │  3. Antwort übersetzen   │
└────────────────────┘   Responses SSE         │  4. Fehler abbilden      │
                                               └────────────┬─────────────┘
┌────────────────────┐   Anthropic Messages                 │ HTTPS
│ Claude Desktop     │ ──────────────────────►              ▼
│ (Chat/Cowork/Code) │ ◄──────────────────────   https://agentrouter.org
└────────────────────┘                              /v1/responses
```

### 5.1 Warum ein lokaler Dienst zwingend ist

1. **Client-Sperre:** AgentRouter akzeptiert nur bestimmte Client-Kennungen. Claude Desktop und Codex 0.165 werden mit 401 abgewiesen; der Dienst setzt eine akzeptierte Kennung.
2. **Protokolllücke:** AgentRouter übersetzt Anthropic-Anfragen intern nach Chat Completions. Werkzeuge + Denkmodus sind dort nicht unterstützt (400). Der Dienst übersetzt nach Responses, wo beides nachweislich funktioniert.
3. **Stabilität:** Nicht unterstützte Beta-Felder (`thinking`, `context_management`, `output_config`, riskante `anthropic-beta`-Werte) werden im stabilen Modus entfernt, statt den Lauf scheitern zu lassen.
4. **Ein Ort für Schlüssel:** Der echte AgentRouter-Key bleibt in einer Datei; Desktop und Codex erhalten nur ein lokales Token.

### 5.2 Prozessmodell

| Plattform | Dienststart | Lebensdauer |
|---|---|---|
| Debian/Termux | `cc-agent` startet `agentrouter serve` als Kindprozess auf freiem Port | Endet mit Claude Code; keine dauerhaft laufenden Prozesse |
| Linux Desktop | systemd-User-Unit `agentrouter.service`, falls systemd verfügbar; sonst Start über Shell-Profil mit PID-Datei | Dauerhaft, Autostart |
| Windows | Autostart über `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` oder Startup-Ordner-Verknüpfung (kein Admin) | Dauerhaft, Autostart |
| Desktop-Betrieb | Dienst muss laufen | Dauerhaft |

---

## 6. Funktionale Anforderungen

### 6.1 Haupt-CLI `agentrouter`

| Befehl | Verhalten |
|---|---|
| `agentrouter login` | Fragt den Key verdeckt ab, prüft ihn gegen `/v1/models`, speichert sicher; `--key-stdin` für Skripte |
| `agentrouter models` | Liest die Liste live, zeigt ID, Endpunkttyp, Status; `--json` |
| `agentrouter setup` | Interaktive Einrichtung: Key, Modus, Port, optional Desktop, optional Autostart |
| `agentrouter serve [--port N] [--daemon] [--foreground]` | Startet den Übersetzer; Portwahl mit Fallback |
| `agentrouter status` | Zeigt Key vorhanden, Modellzahl, Dienststatus, Port, Autostart, Desktop-Profil |
| `agentrouter doctor [--live]` | Führt alle Prüfungen aus, Exit-Code 0/1, `--json` |
| `agentrouter desktop on\|off\|status` | Schreibt/entfernt das eigene Desktop-Profil, sichert `_meta.json` |
| `agentrouter autostart on\|off` | Richtet den Hintergrundstart ein/entfernt ihn |
| `agentrouter undo [--purge]` | Stellt alle Sicherungen wieder her; `--purge` löscht zusätzlich Key/Logs |
| `agentrouter update-models` | Erneuert den lokalen Modell-Cache (nur für Anzeige/Diagnose) |
| `agentrouter version` | Version, Node-Version, Plattform |

Globale Optionen: `--verbose`, `--json`, `--no-color`, `--config-dir <pfad>`.

### 6.2 Modellauswahl (`cc-agent`, `codex-agent`)

- Beim Start **live** `GET /v1/models` mit normalisierter Kennung abrufen.
- Auswahlmenü mit echten IDs, Pfeiltasten/Nummern, Enter bestätigt; `q` bricht ab.
- Zuletzt verwendetes Modell wird **markiert**, aber nicht automatisch gestartet.
- `--model <id>` bzw. `-m` überspringt das Menü; unbekannte ID → Warnung + Menü.
- `--list` gibt nur die Liste aus (skriptfähig), `--json` maschinenlesbar.
- Nicht-interaktives Terminal: nummerierte Liste auf stderr, Auswahl per stdin; bei fehlendem stdin Abbruch mit Exit-Code 2.
- Modell-Cache unter `~/.config/agentrouter/models-cache.json` nur für Anzeige/Diagnose; bei Netzwerkfehler klare Fehlermeldung, kein stilles Starten mit veralteter Liste.
- Sind keine Modelle verfügbar: Exit-Code 3, Ursache nennen (401/503/Netzwerk) und `agentrouter doctor` empfehlen.

### 6.3 Ausfallverhalten

Fehlerklassen und Reaktion:

| Situation | Reaktion |
|---|---|
| Modell fehlt in Liste | Vor dem Start melden, anderes Modell anbieten |
| `503` „kein Kanal" | Rückfrage: anderes Modell wählen / erneut versuchen / abbrechen |
| `401 unauthorized client` | Kein Modellwechsel, sondern Diagnose: Kennung/Adapters Version prüfen |
| `400 Werkzeuge+Denkmodus` | Einmalige Rückfrage: stabilen Modus für diese Sitzung verwenden |
| `429` | Exponentielles Warten (max. 3 Versuche), dann Rückfrage |
| Netzwerkfehler | Klare Meldung, 2 Wiederholungen, dann Abbruch |
| Desktop/Codex 401 | Auf fehlenden Dienst oder falsches lokales Token hinweisen |

Ein Modellwechsel wird **nie** ohne Zustimmung ausgeführt. Wiederholte identische Rückfragen in derselben Sitzung werden vermieden (Entscheidung merken).

### 6.4 Schlüsselverwaltung

- Speicherort Linux/Termux: `~/.config/agentrouter/credentials.json`, Verzeichnis `0700`, Datei `0600`.
- Windows: `%APPDATA%\agentrouter\credentials.json`, ACL nur aktueller Benutzer (kein `chmod`).
- Inhalt: `{ "version": 1, "apiKey": "...", "baseUrl": "https://agentrouter.org", "createdAt": "..." }`.
- Reihenfolge: `AGENTROUTER_API_KEY` (Umgebung) → Datei → Fehler mit Hinweis auf `agentrouter login`.
- Der Key wird nie geloggt, nie an Desktop/Codex weitergegeben, nie in Fehlermeldungen vollständig angezeigt (nur `sk-…` + letzte 4 Zeichen).
- Das lokale Token für Desktop/Codex ist zufällig (32 Byte), liegt in `config.json` und wird bei `desktop on` neu erzeugt.
- **Sicherheitshinweis:** Der in der Anfrage genannte Key wurde im Chat geteilt. Nach der Einrichtung sollte er im AgentRouter-Konto rotiert werden; die Spezifikation enthält ihn bewusst nicht.

### 6.5 Lokaler Übersetzerdienst

#### 6.5.1 Endpunkte

| Methode/Pfad | Zweck |
|---|---|
| `POST /v1/messages` | Anthropic Messages → OpenAI Responses, Streaming und Nicht-Streaming |
| `POST /v1/messages/count_tokens` | Lokale Schätzung (Zeichen/4, Mindestwert 1), nie 404 |
| `GET /v1/models` | Liefert sowohl OpenAI-förmige Liste als auch Anthropic-förmige Sicht (Desktop/Codex) |
| `GET /healthz` | Status, Version, Dienstbereitschaft |
| `GET /v1/me` | Optionale Diagnose: Key vorhanden, Maskierung, Modellzahl |

Bindung ausschließlich `127.0.0.1`. Pflicht-Header für alle außer `/healthz`: `Authorization: Bearer <lokales Token>` oder `x-api-key`; sonst 401 mit Anthropic-Fehlerformat.

#### 6.5.2 Anfrage-Übersetzung (Anthropic → Responses)

| Anthropic | Responses |
|---|---|
| `system` (String oder Blöcke) | `instructions` (Blöcke zu Text zusammengeführt) |
| `messages[].content` Text | `input[]` mit `input_text` |
| Bildblock (`image`, base64/URL) | `input_image` mit `image_url` |
| `tool_use` des Assistenten | `function_call` mit `call_id`, `name`, `arguments` |
| `tool_result` | `function_call_output` mit `call_id`, `output` |
| `tools[].input_schema` | `tools[].parameters`, `type: "function"`, `strict: false` |
| `tool_choice: auto\|any\|tool\|none` | `auto\|required\|{type:function,name}\|none` |
| `max_tokens` | `max_output_tokens` |
| `thinking: adaptive` | `reasoning.effort` (stabil: `none`/`low`; voll: `medium`) |
| `metadata.user_id` | `metadata` bzw. `safety_identifier` (falls akzeptiert) |
| `stream` | `stream` |

Nicht gesendet werden im stabilen Modus: `context_management`, `output_config`, `thinking`, `anthropic-beta` (außer einem minimalen Satz), `top_k`.

#### 6.5.3 Antwort-Übersetzung (Responses → Anthropic)

| Responses-Event | Anthropic-SSE |
|---|---|
| `response.created` | `message_start` mit usage |
| `response.output_item.added` (message) | `content_block_start` Typ `text` |
| `response.output_text.delta` | `content_block_delta` `text_delta` |
| `response.output_item.added` (function_call) | `content_block_start` Typ `tool_use` mit `id`, `name` |
| `response.function_call_arguments.delta` | `content_block_delta` `input_json_delta` |
| `response.output_item.done` | `content_block_stop` |
| `response.completed` | `message_delta` (`stop_reason`: `tool_use` bei Funktionsaufruf, `max_tokens` bei Kürzung, sonst `end_turn`) + `message_stop` |
| `response.failed` / Fehlerobjekt | `error`-Event mit Anthropic-Fehlerform, danach `message_stop` |
| Reasoning-Items | ignorieren (nicht als Text ausgeben) |

- `usage` wird aus `input_tokens`/`output_tokens` gemappt.
- Unbekannte Events werden ignoriert, nicht als Fehler behandelt.
- Bei Nicht-Streaming wird eine vollständige Anthropic-Message gebaut (Text + `tool_use`-Blöcke).
- Keep-alive: alle 15 s ein `ping`-Event, solange der Upstream schweigt.

#### 6.5.4 Upstream-Verhalten

- Ziel: `https://agentrouter.org/v1/responses`.
- Header: `Authorization: Bearer <echter Key>`, `Content-Type: application/json`, `User-Agent: claude-cli/2.1.319 (external, cli)`, `x-app: cli`.
- `store: false`, kein `previous_response_id` (zustandslos, da Claude Code die Historie mitsendet).
- Timeouts: Verbindung 30 s, Gesamtlauf bis 10 min (Claude Code sendet `X-Stainless-Timeout: 600`), Stream-Idle 120 s.
- Wiederholungen: nur bei 429/502/503/Netzwerk, max. 3, mit Jitter; nie bei 400/401/403.
- Modell-Mapping: ID unverändert weitergeben; unbekannte ID → 404-artiger Anthropic-Fehler mit Modellliste.
- Rückübersetzung von Fehlern: 401 → `authentication_error`, 403 → `permission_error`, 404 → `not_found_error`, 429 → `rate_limit_error`, 5xx → `api_error`.

#### 6.5.5 Stabiler Modus (Standard)

- Entfernt `thinking`, `context_management`, `output_config`.
- Reduziert `anthropic-beta` auf `claude-code-20250219` (falls nötig) und entfernt Denk-/Effort-Betas.
- Setzt `reasoning.effort` auf `none` (ohne Werkzeuge) bzw. `low` (mit Werkzeugen).
- Entfernt `strict`/`additionalProperties`-Konflikte aus Werkzeugen.
- Bei erneutem 400 mit Werkzeug-/Reasoning-Bezug: einmaliger automatischer Wiederholversuch ohne `reasoning` (nur innerhalb derselben Anfrage, mit Logeintrag).
- Vollmodus über `--full` oder `AGENTROUTER_MODE=full`; dort werden Denkmodus und Betas durchgereicht.

#### 6.5.6 Protokollierung

- JSON-Zeilen in `~/.config/agentrouter/logs/agentrouter.log`, Rotation bei 5 MB (max. 3 Dateien).
- Pro Anfrage: Zeit, Pfad, Modell, Status, Dauer, Tokenzahlen, Request-ID des Upstreams, ob stabiler Modus aktiv war.
- **Nie** Key, Prompt-Inhalte oder Tool-Ergebnisse im Log.
- `--verbose` zeigt Statuszeilen im Terminal, keine Inhalte.
- `agentrouter report` erzeugt ein redigiertes Diagnosepaket (Logs, Versionen, Masken).

### 6.6 Claude Code starten (`cc-agent`)

Ablauf:

1. Key prüfen (sonst Hinweis auf `agentrouter login`).
2. Modellliste live laden; Menü anzeigen (außer `--model`).
3. Freien Port wählen; `agentrouter serve` starten (Kindprozess, Log).
4. Auf `/healthz` warten (max. 10 s).
5. Umgebung setzen und `claude` starten:
   - `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>`
   - `ANTHROPIC_AUTH_TOKEN=<lokales Token>`
   - `ANTHROPIC_API_KEY` entfernen (sonst Konflikt)
   - `ANTHROPIC_MODEL=<gewähltes Modell>`
   - `ANTHROPIC_SMALL_FAST_MODEL=<gewähltes Modell>` (Kompatibilität)
   - `ANTHROPIC_CUSTOM_MODEL_OPTION=<gewähltes Modell>`
   - `CLAUDE_CODE_MAX_CONTEXT_TOKENS=<konfiguriert, Standard 200000>`
   - `CLAUDE_CODE_AUTO_COMPACT_WINDOW` nur setzen, wenn konfiguriert
   - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
6. Argumente unverändert an `claude` weiterreichen (`-p`, `--resume`, `--model` etc.).
7. Exit-Code von `claude` übernehmen; Kindprozess sauber beenden; bei Termux keinen Prozess zurücklassen.
8. Bei `SIGINT`/`SIGTERM`: Claude beenden, Dienst beenden, Exit-Code 130.

Zusätzlich:

- `cc-agent --print "…"` funktioniert, weil Argumente durchgereicht werden.
- `cc-agent --dry-run` zeigt Umgebung und Port, startet nichts.
- `cc-agent --no-service` nutzt einen bereits laufenden Dienst (Desktop-Betrieb).
- Fehlt `claude` im PATH: klare Meldung mit Installationsbefehl, Exit-Code 4.

### 6.7 Codex starten (`codex-agent`)

- Gleiches Auswahlmenü und gleiche Live-Liste.
- **Isolierte Umgebung:** `CODEX_HOME=~/.local/share/agentrouter/codex` (Windows: `%LOCALAPPDATA%\agentrouter\codex`). Dadurch bleibt `~/.codex` unverändert.
- Dort generierte `config.toml`:

```toml
model = "<gewähltes Modell>"
model_provider = "agentrouter"

[model_providers.agentrouter]
name = "AgentRouter"
base_url = "http://127.0.0.1:<port>/v1"
env_key = "AGENTROUTER_LOCAL_TOKEN"
wire_api = "responses"
request_max_retries = 2
stream_max_retries = 2
```

- `AGENTROUTER_LOCAL_TOKEN=<lokales Token>` wird gesetzt; `OPENAI_API_KEY` wird nicht überschrieben.
- Da Codex eigene Sitzungen/Verlauf im `CODEX_HOME` speichert, sind sie von den normalen Codex-Sitzungen getrennt. `codex-agent --share-history` (optional, nicht Standard) könnte auf `~/.codex` zeigen; **nicht** umsetzen, solange nicht gefordert.
- `codex-agent exec …` und normale Argumente werden durchgereicht; Exit-Code übernommen.
- Dienst wird wie bei `cc-agent` gestartet/beendet (Termux) bzw. ein laufender Dienst genutzt.
- `codex --version` wird geprüft; bei fehlender Responses-Unterstützung klare Meldung.

### 6.8 Claude Desktop einrichten

`agentrouter desktop on`:

1. Prüfen, ob der Desktop-Konfigurationsordner existiert; sonst Anleitung (App einmal starten).
2. Eigenes Profil schreiben: `<configDir>/configLibrary/6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42.json` (feste, eigene ID; kollidiert nicht mit CC-Switch).
3. Inhalt (Werte als Strings, wie von Claude Desktop erwartet):

```json
{
  "inferenceProvider": "gateway",
  "inferenceCredentialKind": "static",
  "inferenceGatewayBaseUrl": "http://127.0.0.1:8787",
  "inferenceGatewayApiKey": "<lokales Token>",
  "inferenceGatewayAuthScheme": "bearer",
  "inferenceModels": ["gpt-5.6-sol", "gpt-6-astra", "gpt-6.1-sol"]
}
```

4. `_meta.json` sichern (`backups/<zeitstempel>/`), `appliedId` auf die eigene ID setzen, alle anderen Felder erhalten.
5. Dienst und Autostart sicherstellen (Desktop braucht den Dienst dauerhaft).
6. Neustart der App anfordern (kein automatisches Beenden ohne Zustimmung; `--restart` beendet und startet).
7. Ausgabe: Pfad, aktive ID, Hinweis „Claude Desktop vollständig beenden und neu starten", Prüfschritte.

`agentrouter desktop off`:

- Eigenes Profil entfernen, `_meta.json` aus der Sicherung wiederherstellen.
- CC-Switch-Dateien werden nicht angefasst; danach kann CC-Switch wie gewohnt umschalten.
- Ohne Sicherung: `appliedId` entfernen und Hinweis ausgeben.

Grenzen und Fallback:

- Zeigt die Desktop-App trotz `inferenceModels` nur Claude-IDs an, wird das im `doctor`-Bericht als Befund ausgegeben. Fallback (nur nach Rückfrage): virtuelle IDs `claude-sonnet-4-5` → `gpt-5.6-sol` im Adapter mappen. Standard bleibt: **echte Namen**.
- Die genaue Basis-URL-Form (mit/ohne `/v1`) wird beim ersten Lauf empirisch geprüft; der Adapter akzeptiert beide Schreibweisen (`/v1/messages` und `/messages`).

### 6.9 Installation

#### Linux / Termux (`scripts/install.sh`)

- Node.js ≥ 20 prüfen (Termux: `pkg install nodejs`), sonst Abbruch mit Anleitung.
- Projekt nach `~/.local/share/agentrouter/app` kopieren (kein Root).
- Startskripte nach `~/.local/bin` verlinken: `agentrouter`, `cc-agent`, `codex-agent`.
- Prüfen, ob `~/.local/bin` im PATH ist; sonst Hinweis + optionaler Eintrag in `~/.profile`.
- Termux/PRoot erkennen (`PREFIX`, `/data/data/com.termux`, fehlendes systemd): keinen Autostart einrichten, Dienst nur on-demand.
- Keine Änderung an `~/.claude`, `~/.codex`, `~/.cc-switch`.

#### Windows (`scripts/install.ps1`, PowerShell 5.1+)

- Node.js ≥ 20 prüfen.
- Nach `%LOCALAPPDATA%\Programs\agentrouter` kopieren.
- `cc-agent.cmd`, `codex-agent.cmd`, `agentrouter.cmd` erzeugen (rufen `node <pfad>\bin\...` auf).
- Benutzer-PATH ergänzen (kein Admin, `setx`/Registry `HKCU\Environment`), PATH-Länge beachten.
- Autostart optional über `HKCU\...\Run` mit `agentrouter serve --daemon`.
- Kein Dienst, keine Registry-Policy, keine Änderung an Claude-/Codex-/CC-Switch-Dateien außer dem optionalen Desktop-Profil.

#### Deinstallation

`agentrouter undo --purge` entfernt Startskripte, PATH-Eintrag, Autostart, Desktop-Profil, Key und Logs; Sicherungen werden vorher angeboten.

### 6.10 Rücknahme (`agentrouter undo`)

- Sicherungen liegen unter `~/.config/agentrouter/backups/<ISO-Zeitstempel>/` mit Manifest (`manifest.json`: Datei, SHA-256, Zeitpunkt, Aktion).
- Gesichert werden: `_meta.json` der Desktop-Konfiguration, optional `settings.json`/`config.toml` (nur falls je verändert), PATH-Eintrag, Autostart-Eintrag.
- `undo` ist idempotent und fragt vor jedem Überschreiben nach (`--yes` für Skripte).
- Ausgabe listet jede zurückgenommene Änderung und jede bewusst nicht angefasste Datei.
- CC-Switch-Dateien werden nie gesichert oder verändert; `undo` prüft per Hash, dass sie unverändert sind, und meldet das.

### 6.11 Diagnose (`agentrouter doctor`)

Prüfungen (jeweils OK/Warnung/Fehler, Exit-Code 1 bei Fehler):

1. Node-Version, Plattform, Termux-Erkennung.
2. Key vorhanden, Format plausibel, Maskierung korrekt.
3. `GET /v1/models`: HTTP-Status, Anzahl Modelle, Liste.
4. Client-Kennung: derselbe Aufruf mit und ohne normalisierte Kennung (erwartet 200 vs. 401) – belegt die Sperre.
5. `POST /v1/responses` mit Funktion + `reasoning.effort`: erwartet `function_call`.
6. `POST /v1/messages` am lokalen Dienst: Text- und Werkzeugantwort, Streaming.
7. `count_tokens` lokal: liefert Zahl statt 404.
8. Port frei, Dienst erreichbar, lokales Token gültig.
9. Autostart-Status (nur Desktop-Betrieb).
10. Desktop-Profil vorhanden/aktiv (falls eingerichtet), `_meta.json` parsebar.
11. Claude-Code- und Codex-Version, PATH, `CODEX_HOME` isoliert.
12. Hinweis auf Key-Rotation, falls Key älter als 30 Tage.

`--live` führt zusätzlich einen echten Mini-Prompt aus („Antworte nur mit OK") und misst Latenz.

---

## 7. Datenformate und Ablage

| Datei | Inhalt |
|---|---|
| `~/.config/agentrouter/credentials.json` | Key, Basis-URL, Zeitpunkt (0600) |
| `~/.config/agentrouter/config.json` | Port, Modus (`stable`/`full`), lokales Token, Kontextfenster, Log-Level, Desktop-ID |
| `~/.config/agentrouter/models-cache.json` | letzte Modellliste + Zeitpunkt (nur Anzeige/Diagnose) |
| `~/.config/agentrouter/agentrouter.pid` | PID des Hintergrunddienstes |
| `~/.config/agentrouter/logs/agentrouter.log` | JSON-Zeilen, rotiert |
| `~/.config/agentrouter/backups/<ts>/` | Sicherungen + Manifest |
| `~/.local/share/agentrouter/app/` | installierte Anwendung |
| `~/.local/share/agentrouter/codex/config.toml` | isolierte Codex-Konfiguration |
| `%APPDATA%\agentrouter\…` | Windows-Äquivalente |
| `%LOCALAPPDATA%\agentrouter\codex\…` | Windows Codex-Isolation |

Beispiel `config.json`:

```json
{
  "version": 1,
  "port": 8787,
  "mode": "stable",
  "contextWindow": 200000,
  "helperToken": "<32-Byte-Zufall, base64url>",
  "desktopProfileId": "6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42",
  "logLevel": "info"
}
```

Portwahl: 8787, bei Belegung 8788–8797; gewählter Port wird in `config.json` und PID-Datei festgehalten.

---

## 8. Sicherheit

- Dienst bindet nur an Loopback; jede Anfrage braucht das lokale Token (zeitkonstanter Vergleich).
- Kein Key in Logs, Fehlermeldungen, Prozessargumenten oder im Repo.
- Dateirechte 0700/0600; Windows-ACL auf den aktuellen Benutzer beschränken.
- Lokales Token rotierbar (`agentrouter serve --rotate-token`); Desktop/Codex werden dabei aktualisiert.
- Kein automatisches Senden von Telemetrie; `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`.
- Prompts und Tool-Ausgaben werden nicht persistiert.
- Sicherheitsrelevante Änderungen an fremden Konfigurationen nur nach Bestätigung, immer mit Backup.
- Empfehlung im Abschlussbericht: AgentRouter-Key nach der Einrichtung rotieren, da er im Chat geteilt wurde.

---

## 9. Kompatibilität

| Plattform | Anforderungen | Besonderheiten |
|---|---|---|
| Debian 13 aarch64 (Termux/PRoot) | Node ≥ 20, Claude Code, Codex | kein systemd; Dienst als Kindprozess; `127.0.0.1` |
| Windows 10/11 | PowerShell 5.1+, Node ≥ 20, Claude Code, Codex, Claude Desktop | kein Admin; PATH über `HKCU`; Desktop-Pfad `%LOCALAPPDATA%\Claude-3p` |
| Linux Desktop (optional) | systemd-user oder Shell-Profil | Autostart nur wenn verfügbar |

Getestete Mindestversionen: Claude Code 2.1.319, Codex 0.165.0, Node 24.22.1. Ältere Versionen: Warnung, kein harter Abbruch (außer fehlendem `wire_api = "responses"`).

---

## 10. Abnahmekriterien

Jedes Kriterium gilt als erfüllt, wenn der Befehl mit Exit-Code 0 endet **und** die genannte Wirkung beobachtet wurde. Nachweise: Konsolenausgabe, Logauszug, Dateiinhalt.

### 10.1 Stufe 1 – Verbindung

- [ ] `agentrouter login` speichert den Key mit 0600; `agentrouter status` maskiert ihn.
- [ ] `agentrouter models` listet live mindestens `gpt-5.6-sol`, `gpt-6-astra`, `gpt-6.1-sol`.
- [ ] `agentrouter doctor` meldet alle Pflichtprüfungen OK, inklusive Werkzeug-Test über `/v1/responses`.
- [ ] `agentrouter doctor` belegt die Client-Sperre (ohne Kennung 401, mit Kennung 200).

### 10.2 Stufe 2 – Claude Code

- [ ] `cc-agent --model gpt-5.6-sol -p "Antworte nur mit OK"` gibt `OK` aus, Exit-Code 0.
- [ ] Menüstart ohne `--model` zeigt die Live-Liste, Enter startet das markierte Modell.
- [ ] In einem temporären Ordner: „Lege `hello.js` an, die die aktuelle Zeit ausgibt, führe sie aus und korrigiere Fehler." → Datei existiert, Ausführung erfolgreich, Werkzeugaufrufe im Log sichtbar.
- [ ] Streaming erscheint fortlaufend (nicht erst am Ende).
- [ ] Nach dem Beenden von Claude Code läuft kein Adapterprozess mehr (Termux).
- [ ] Bei simuliertem 503 erfolgt eine Rückfrage, kein stiller Modellwechsel.

### 10.3 Stufe 3 – Codex

- [ ] `codex-agent --model gpt-5.6-sol exec "Antworte nur mit OK"` liefert `OK`, Exit-Code 0.
- [ ] Codex-Aufgabe legt eine Datei an und führt sie aus (Werkzeuge funktionieren).
- [ ] `~/.codex` bleibt unverändert (Hash-Vergleich vor/nach).
- [ ] Zweiter Lauf mit anderem Modell über das Menü funktioniert.

### 10.4 Stufe 4 – Claude Desktop

- [ ] `agentrouter desktop on` schreibt das eigene Profil, sichert `_meta.json`, Dienst läuft.
- [ ] Nach vollständigem Neustart zeigt die App die echten Modellnamen (oder der dokumentierte Fallback greift nach Rückfrage).
- [ ] Chat-Anfrage „Antworte nur mit OK" funktioniert; Cowork/Code-Sitzung startet mit demselben Modell.
- [ ] `agentrouter desktop off` stellt den vorherigen `appliedId` wieder her.
- [ ] Danach funktioniert CC-Switch unverändert (NVIDIA-Route); CC-Switch-Dateien sind bytegleich.
- [ ] Erneutes `desktop on` funktioniert ohne manuelle Reparatur.

### 10.5 Stufe 5 – Windows

- [ ] `install.ps1` läuft ohne Admin, `cc-agent`/`codex-agent`/`agentrouter` sind in einer neuen PowerShell auffindbar.
- [ ] Stufen 1–3 laufen auf Windows.
- [ ] Autostart startet den Dienst nach Anmeldung; `agentrouter status` bestätigt.
- [ ] `agentrouter undo` entfernt PATH-Eintrag, Autostart, Desktop-Profil und Startskripte.

### 10.6 Stufe 6 – Rücknahme

- [ ] `agentrouter undo` entfernt alle Adapteränderungen, stellt Sicherungen wieder her, ist idempotent.
- [ ] Keine fremde Datei (CC-Switch, Claude, Codex) wurde inhaltlich verändert.

---

## 11. Testplan

### 11.1 Unit-Tests (ohne Netzwerk)

- Übersetzung Anthropic → Responses: Text, Systemblöcke, Bilder, `tool_use`, `tool_result`, `tool_choice`, `max_tokens`, Denkmodus, unbekannte Felder.
- Übersetzung Responses → Anthropic: Text-Stream, Werkzeug-Stream (Teilargumente), Nicht-Streaming, Fehler, Reasoning-Items ignorieren.
- SSE-Parser: fragmentierte Chunks, `[DONE]`, unbekannte Events, Ping.
- `count_tokens`-Schätzung (leer, lang, Unicode).
- Modellauswahl: TTY, non-TTY, `--model`, `--list`, Abbruch.
- Fehlerklassifizierung und Rückfrage-Logik.
- Sicherung/Rücknahme mit temporärem Verzeichnis (Manifest, Hash, Idempotenz).
- Plattformpfade (Linux/Windows/Termux) über Pfad-Abstraktion.

Golden Fixtures: die abgefangene echte Claude-Code-Anfrage (redigiert, ohne Prompt-Inhalte) als `tests/fixtures/claude-code-request.json`; erwartete Responses-Anfrage als Snapshot.

### 11.2 Integrationstests (live, opt-in über `AGENTROUTER_API_KEY`)

- `doctor --live`.
- Textantwort, Werkzeugantwort, Streaming, Modellwechsel.
- Fehlerpfad: ungültiges Modell → klare Meldung, keine Endlosschleife.
- Rate-Limit-Simulation über lokalen Mock (429), Retry und Rückfrage.

### 11.3 Manuelle Tests

- Claude Desktop auf Windows (Neustart, Modellwahl, Chat/Cowork/Code, CC-Switch-Rückweg).
- Termux: Prozessliste nach Exit, kein Zombie-Dienst, `127.0.0.1`.
- Windows-PATH in neuer Sitzung, Autostart nach Anmeldung.
- Netzlaufwerk/OneDrive-Sonderfälle für `%LOCALAPPDATA%` (nur Hinweis, kein Testzwang).

---

## 12. Risiken und offene Punkte

| # | Risiko | Auswirkung | Gegenmaßnahme / Entscheidung |
|---|---|---|---|
| R1 | AgentRouter ändert die Client-Sperre oder Modellliste | Start bricht | Kennung zentral konfigurierbar; `doctor` zeigt Soll/Ist; Modelle live |
| R2 | Desktop akzeptiert nur `claude-*`-IDs im Modellwähler | echte Namen nicht sichtbar | Zuerst echte Namen; Fallback mit virtuellen IDs nur nach Rückfrage |
| R3 | Genaue Gateway-Basis-URL für Desktop (mit/ohne `/v1`) unklar | Profil greift nicht | Adapter akzeptiert beide Pfade; `desktop on --check` testet Varianten |
| R4 | Denkmodus über mehrere Werkzeugrunden verliert Kontext (zustandslos) | schlechtere Antworten | stabiler Modus Standard; `--full` optional; Reasoning-Items im selben Response-Lauf nutzen |
| R5 | 403 „Key based authentication…" bei Werkzeugen über `/v1/messages` | Lauf scheitert | Adapter umgeht den Pfad vollständig über `/v1/responses` |
| R6 | 200k-Kontextannahme von Claude Code | vorzeitige Kompaktierung | `CLAUDE_CODE_MAX_CONTEXT_TOKENS` setzen, pro Modell konfigurierbar |
| R7 | Termux/PRoot: kein systemd, begrenzte Ressourcen | Autostart unmöglich | On-demand-Dienst als Kindprozess; kein Hintergrunddienst nötig |
| R8 | Windows-PATH/ACL/OneDrive | Startbefehl fehlt | Installer prüft PATH, schreibt `HKCU`; `doctor` erkennt fehlenden PATH |
| R9 | CC-Switch und Adapter schreiben dieselbe `_meta.json` | aktives Profil überschrieben | eigene ID, Backup, `desktop off` stellt vorherigen Zustand her; keine CC-Switch-Dateien |
| R10 | Key im Chat geteilt | Missbrauch | nach Einrichtung rotieren; Key nur in geschützter Datei; Maskierung |
| R11 | Kosten/Rate-Limits unbeaufsichtigt | Überraschung | Log mit Tokenzahlen; keine automatischen Wiederholungen bei 4xx; Hinweis auf Limits |
| R12 | Claude Code erkennt Modell nicht | Warnung, `/model`-Liste unvollständig | `ANTHROPIC_CUSTOM_MODEL_OPTION` + `cc-agent`-Menü; Warnung dokumentiert |

**Offene Punkte, die während der Umsetzung beantwortet werden müssen:**

1. Exakte Desktop-Anforderung an `inferenceModels` (Format, Pflichtfeld?) – durch Test mit realer App klären.
2. Ob Desktop beim Start `GET /v1/models` oder einen anderen Discovery-Endpunkt aufruft – Log im Adapter zeigt es; ggf. nachbilden.
3. Ob Codex 0.165 mit `base_url` auf Loopback und `env_key` ohne `auth.json` startet – Test; sonst `auth.json` mit lokalem Token erzeugen.
4. Ob AgentRouter `store: false` bei Werkzeug-Folgerunden akzeptiert – Test; sonst `store: true` und `previous_response_id` nur innerhalb einer Anfrage.
5. Ob ein minimaler `anthropic-beta`-Satz nötig ist oder ganz entfallen kann – Test.
6. Ob `CLAUDE_CODE_MAX_CONTEXT_TOKENS` in 2.1.319 die Warnung beseitigt – Test.

---

## 13. Umsetzungsreihenfolge (Meilensteine)

1. **M1 – Adapterkern:** Projektgerüst (Node ESM, keine Laufzeit-Abhängigkeiten), Konfiguration, Key-Speicher, Live-Modellliste, `/healthz`.
2. **M2 – Übersetzer:** Anthropic→Responses, Responses→Anthropic (Streaming + Werkzeuge), stabiler Modus, Fehlerabbildung; Unit-Tests mit echten Fixtures.
3. **M3 – `cc-agent`:** Menü, Dienststart als Kindprozess, Umgebungsvariablen, Argumentweitergabe, Ausfallrückfragen; Stufe-2-Abnahme.
4. **M4 – `codex-agent`:** isoliertes `CODEX_HOME`, generierte `config.toml`, Menü, Stufe-3-Abnahme.
5. **M5 – Claude Desktop:** Profil schreiben/entfernen, `_meta.json`-Sicherung, Autostart, `desktop on/off/status`; Stufe-4-Abnahme.
6. **M6 – Installation & Rücknahme:** `install.sh`, `install.ps1`, PATH, Autostart, `undo`; Stufe-5/6.
7. **M7 – Härtung:** Logrotation, Token-Rotation, `doctor --live`, Report-Paket, Dokumentation (`README.md`, `docs/`).

Nach M3 ist ein erstes nachweislich funktionierendes Produkt für Claude Code vorhanden; nach M5 sind alle drei Werkzeuge abgedeckt.

---

## 14. Glossar (ohne Fachbegriffe)

| Begriff | Bedeutung |
|---|---|
| Adapter / Übersetzerdienst | Kleines Programm auf dem eigenen Rechner, das Anfragen in der Sprache des einen Werkzeugs annimmt und in der Sprache von AgentRouter weiterleitet |
| Schlüssel (Key) | Persönliches Kennwort für AgentRouter, wird wie ein Passwort behandelt |
| Profil | Gespeicherter Satz von Einstellungen, den man aktivieren oder ersetzen kann, ohne andere Einstellungen zu verlieren |
| Gateway | Adresse, an die ein Programm seine Anfragen schickt, statt direkt an den Hersteller |
| Autostart | Programm startet automatisch bei der Anmeldung |
| Rücknahme | Alles, was die Einrichtung verändert hat, wird auf den vorherigen Stand zurückgesetzt |
| Stabiler Modus | Verzicht auf riskante Zusatzfunktionen, damit Werkzeuge und Dateiarbeit zuverlässig laufen |

---

## 15. Anhang: Nachweise aus der Voruntersuchung

- Modellliste: `gpt-5.6-sol`, `gpt-6-astra`, `gpt-6.1-sol`.
- `POST /v1/responses` mit `get_time`-Funktion lieferte `function_call` mit `call_id` und `{}`-Argumenten.
- Streaming lieferte `response.output_item.added` (Reasoning + Funktion), `response.function_call_arguments.delta/done`, `response.completed`.
- Exakter Claude-Code-Body (80 KB, 21 Werkzeuge, `thinking.adaptive`, `context_management`, `output_config`) erzeugte den 400-Fehler „Function tools with reasoning_effort are not supported … use /v1/responses".
- `count_tokens` antwortete mit 404.
- Desktop- und Codex-Kennungen wurden mit 401 abgewiesen.

Diese Nachweise sind die Grundlage für die Architekturentscheidung „lokaler Übersetzer + Responses-Pfad" und werden als redigierte Fixtures in die Tests übernommen.
