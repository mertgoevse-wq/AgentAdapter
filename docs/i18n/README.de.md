# AgentAdapter

**Claude Code, Codex CLI und Claude Desktop mit AgentRouter-Modellen.**

AgentAdapter ist eine kleine lokale Brücke. Sie spricht mit deinen Werkzeugen Anthropic Messages und mit AgentRouter OpenAI Responses. Zusätzlich sendet sie die Client-Kennung, die AgentRouter verlangt – Codex und Claude Desktop tun das von sich aus nicht.

[![Tests](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml/badge.svg)](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)](https://nodejs.org)
[![Lizenz](https://img.shields.io/badge/license-MIT-blue)](../../LICENSE)

**Sprachen:** [English](../../README.md) · Deutsch · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md) · [中文](README.zh-CN.md)

---

## Warum es das gibt

Drei gemessene Eigenschaften von AgentRouter machen eine Direktverbindung für agentische Arbeit unbrauchbar:

| Beobachtung | Folge |
|---|---|
| `/v1/messages` mit Werkzeugen **und** Denkmodus liefert `400` („use `/v1/responses`") | Claude Code kann seine Werkzeuge über den Anthropic-Pfad nicht nutzen |
| Codex CLI und Claude Desktop erhalten `401 unauthorized client` | Beide dürfen nicht direkt mit AgentRouter sprechen |
| `/v1/responses` akzeptiert Werkzeuge, Reasoning und Streaming | Das ist der funktionierende Pfad |

Deshalb übersetzt AgentAdapter Anfragen, statt sie nur weiterzuleiten:

```
Claude Code ──Anthropic Messages──┐
Codex CLI ────OpenAI Responses───┼──► 127.0.0.1:8787 ──► agentrouter.org/v1/responses
Claude Desktop ──Anthropic───────┘        Brücke
```

Die Brücke lauscht nur auf Loopback, verlangt ein lokales Token und hält den echten API-Schlüssel aus jeder Client-Konfiguration heraus.

---

## Was heute läuft

| Bereich | Android / Termux | Windows / Linux-Desktop |
|---|---|---|
| Claude Code über `cc-agent` | **Live geprüft**: Text, Werkzeuge, Datei anlegen, ausführen | Implementiert, nicht auf Windows-Hardware ausgeführt |
| Codex CLI über `codex-agent` | **Live geprüft**: Text, Werkzeuge, Datei anlegen | Implementiert, nicht auf Windows-Hardware ausgeführt |
| Live-Modellmenü | Geprüft (interaktiv und per Pipe) | Implementiert |
| Claude-Desktop-Profil | Hier nicht anwendbar; App fehlt | Schreiben/Wiederherstellen **mit simuliertem Konfigordner geprüft**; echte App nicht getestet |
| Hintergrunddienst + Autostart | Absichtlich nicht verfügbar (nur on-demand) | Implementiert, auf Windows nicht getestet |
| Rücknahme mit einem Befehl | Für Starter geprüft; Desktop/Autostart implementiert | Implementiert, auf Windows nicht getestet |

Vollständige Nachweise und Lücken: [`docs/STATUS.md`](../STATUS.md) und [`docs/VERIFICATION.md`](../VERIFICATION.md).

---

## Voraussetzungen

- **Node.js 20 oder neuer** (getestet mit 24.22.1)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`) und/oder **Codex CLI** (`npm install -g @openai/codex`)
- Ein **AgentRouter-API-Schlüssel** mit Zugriff auf mindestens ein Modell
- Claude Desktop nur, wenn du die Desktop-Anbindung willst

Keine Laufzeitabhängigkeiten. Die Brücke nutzt nur `http`, `fetch` und `crypto` aus Node.

---

## Installation

### Android / Termux

```bash
pkg install nodejs git
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
bash scripts/install.sh
```

Neue Shell öffnen, dann:

```bash
agentrouter login
cc-agent
codex-agent
```

Auf Android startet `cc-agent` die Brücke nur für die Dauer der Sitzung. Danach läuft nichts weiter.

Codex' Bubblewrap-Sandbox funktioniert unter Termux/PRoot nicht. `codex-agent` erkennt das, startet Codex ohne Sandbox und gibt einen Hinweis aus. Mit `AGENTROUTER_CODEX_SANDBOX=1` bleiben deine eigenen Codex-Flags unverändert.

### Windows

```powershell
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

Ein **neues** PowerShell-Fenster öffnen, dann:

```powershell
agentrouter login
cc-agent
codex-agent
agentrouter desktop on
```

Der Installer nutzt `%LOCALAPPDATA%\Programs\agentrouter`, trägt den Ordner nur in den **Benutzer**-PATH ein und braucht keine Administratorrechte.

Ausführliche Koexistenz mit OmniRoute und CC-Switch: [`docs/WINDOWS.md`](../WINDOWS.md).

---

## Erster Start

`agentrouter login` fragt den Schlüssel verdeckt ab, prüft ihn gegen AgentRouter und speichert ihn unter:

- Linux/Termux: `~/.config/agentrouter/credentials.json` (`0600`)
- Windows: `%APPDATA%\agentrouter\credentials.json`

Danach zeigt `cc-agent` die Live-Modellliste:

```
Claude Code model  ↑/↓, Enter, q
❯ gpt-5.6-sol        last used
  gpt-6-astra
  gpt-6.1-sol
```

Enter startet Claude Code mit diesem Modell. `-m <id>` überspringt das Menü, `--list` gibt die Liste für Skripte aus.

---

## Befehle

| Befehl | Zweck |
|---|---|
| `agentrouter login` | Schlüssel speichern und prüfen |
| `agentrouter models` | Live-Modellliste (`--json`) |
| `agentrouter setup` | Einrichtung; optional `--desktop` / `--autostart` |
| `agentrouter serve` | Brücke im Vordergrund (`--port`, `--mode`) |
| `agentrouter status` | Schlüssel, Dienst, Modus, Desktop, Autostart |
| `agentrouter doctor` | Durchgängige Diagnose (`--json`, `--quick`) |
| `agentrouter desktop on\|off\|status` | Claude-Desktop-Profil verwalten |
| `agentrouter autostart on\|off` | Start bei Anmeldung (nicht auf Termux) |
| `agentrouter undo` | Alle Änderungen zurücknehmen (`--purge` löscht auch Schlüssel und Logs) |
| `cc-agent` | Modellmenü, dann Claude Code |
| `codex-agent` | Modellmenü, dann Codex mit eigenem `CODEX_HOME` |

Beide Starter reichen unbekannte Argumente durch: `cc-agent -m gpt-5.6-sol -p "..."`, `codex-agent exec --skip-git-repo-check "..."`.

---

## Claude Desktop

Claude Desktop liest Drittanbieter-Einstellungen nur beim Start. AgentAdapter schreibt ein eigenes Profil und fasst CC-Switch-Profile nicht an.

```bash
agentrouter desktop on
# Claude Desktop vollständig beenden (auch Tray-Symbol), dann neu öffnen
```

Geschrieben wird:

- Linux: `~/.config/Claude-3p/configLibrary/`
- Windows: `%LOCALAPPDATA%\Claude-3p\configLibrary\`
- macOS: `~/Library/Application Support/Claude-3p/configLibrary/`
- Profil-ID: `6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42`
- Gateway: `http://127.0.0.1:8787`
- Modelle: explizite Einträge, weil die automatische Erkennung nur Claude-ähnliche IDs akzeptiert

`agentrouter desktop off` löscht das Profil und stellt die vorherige `_meta.json` wieder her. Danach kann CC-Switch wieder übernehmen. Details: [`docs/CLAUDE-DESKTOP.md`](../CLAUDE-DESKTOP.md).

> **Noch nicht mit der echten App geprüft.** Der Profil-Rundlauf wurde mit einem simulierten Konfigordner getestet. Das genaue Verhalten der Windows-App braucht einen Lauf auf einem Rechner mit installiertem Claude Desktop.

---

## Windows, während OmniRoute oder CC-Switch routet

AgentAdapter ändert weder `~/.claude/settings.json` noch `~/.codex/config.toml` oder CC-Switch-Dateien.

- Eine normale `claude`-Sitzung nutzt weiter OmniRoute/NVIDIA.
- `cc-agent` setzt `ANTHROPIC_BASE_URL` und das Modell **nur für seinen eigenen Kindprozess**.
- `codex-agent` nutzt ein eigenes `CODEX_HOME` unter `%LOCALAPPDATA%\agentrouter\codex`; dein normales Codex-Profil und deine Historie bleiben unberührt.
- Das Desktop-Profil ist getrennt von CC-Switch; `desktop off` stellt die vorherige `appliedId` wieder her.

Du kannst das Repository also klonen und mit Claude Code daran arbeiten, während Claude Code weiter über OmniRoute läuft. Die genaue Reihenfolge steht in [`docs/WINDOWS.md`](../WINDOWS.md).

---

## Sicherheit

- Der API-Schlüssel landet nie im Repository, im Desktop-Profil, in der Codex-Konfiguration oder in Prozessargumenten.
- Die Brücke lauscht nur auf `127.0.0.1` und verlangt ein zufälliges lokales Token (`0600`).
- Upstream-Anfragen senden immer eine Claude-CLI-Kennung und `x-app: cli`.
- Logs enthalten Modell, Status, Tokenzahlen und Zeiten – keine Prompts, Tool-Ausgaben oder Schlüssel.
- Das Desktop-Profil speichert das **lokale Brückentoken**, nicht den AgentRouter-Schlüssel.
- Wurde ein Schlüssel je in Chat, Issue oder Commit geteilt, rotiere ihn im AgentRouter-Konto.

Mehr: [`SECURITY.md`](../../SECURITY.md).

---

## Fehlerbehebung

| Symptom | Ursache | Lösung |
|---|---|---|
| `401 unauthorized client detected` | Client-Sperre upstream geändert oder Client umgeht die Brücke | `agentrouter doctor`; AgentAdapter aktualisieren |
| `400 Function tools with reasoning_effort are not supported` | Anfrage lief über den Anthropic-Pfad | Standardmodus `stable` verwenden; die Brücke nutzt `/v1/responses` |
| Claude-Desktop-Modellliste leer | App nicht vollständig neu gestartet | Tray-Symbol beenden, neu öffnen, `agentrouter desktop status` prüfen |
| Codex endet mit 182 auf Termux | Bubblewrap-Sandbox unter PRoot nicht verfügbar | `codex-agent` deaktiviert sie automatisch; kein `-s workspace-write` übergeben |
| `Port 8787 is already in use` | Andere Brücke oder App | `agentrouter serve --port 8788` |
| `claude: not found` | CLI fehlt | `npm install -g @anthropic-ai/claude-code` |
| Modellliste leer | Schlüssel hat keine OpenAI-Modelle | Modellgruppe im AgentRouter-Konto prüfen |

Logs: `~/.config/agentrouter/logs/agentrouter.log`. Erster Schritt ist immer `agentrouter doctor`.

---

## Entwicklung

```bash
node --test
node bin/agentrouter.js doctor --quick
```

Aufbau:

```
bin/              CLI-Einstiegspunkte
src/translate.js  Anthropic-↔-Responses-Übersetzung und SSE-Zustandsmaschine
src/server.js     lokale HTTP-Brücke
src/agent.js      gemeinsame Startlogik für cc-agent / codex-agent
src/desktop.js    Claude-Desktop-Profil mit Sicherung
src/doctor.js     Live-Diagnose
test/             18 Tests mit nachgebildetem Upstream
docs/             Status, Prüfprotokoll, Windows- und Desktop-Anleitungen, Spec
```

Die ursprüngliche Konzeption steht in [`docs/agentrouter-adapter-spec.md`](../agentrouter-adapter-spec.md). Wenn du mit Claude Code oder einem anderen Agenten weiterarbeitest: [`AGENTS.md`](../../AGENTS.md).

---

## Status und Grenzen

Geprüft auf Android/Termux: Anmeldung, Live-Modelle, Claude Code mit Werkzeugen, Codex mit Werkzeugen, Streaming, Modellmenü, lokales Token, Diagnose, Desktop-Profilmechanik, Installer und Rücknahme.

Nicht auf Hardware geprüft: Windows-Installation und Autostart, Claude Desktop mit der echten App, voller Reasoning-Modus, systemd-Autostart unter Linux.

Absichtlich nicht umgesetzt: Prompt-Cache-Übersetzung, `/v1/chat/completions`, GUI, npm-Veröffentlichung, Hintergrunddienst auf Android.

Die vollständige Liste steht in [`docs/STATUS.md`](../STATUS.md).

---

## Lizenz

MIT. Siehe [`LICENSE`](../../LICENSE).
