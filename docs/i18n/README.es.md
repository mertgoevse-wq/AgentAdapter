# AgentAdapter

**Claude Code, Codex CLI y Claude Desktop con modelos de AgentRouter.**

AgentAdapter es un pequeño puente local. Habla Anthropic Messages con tus herramientas y OpenAI Responses con AgentRouter. Además envía la identificación de cliente que AgentRouter exige, algo que Codex y Claude Desktop no hacen por sí solos.

[![Pruebas](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml/badge.svg)](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)](https://nodejs.org)
[![Licencia](https://img.shields.io/badge/license-MIT-blue)](../../LICENSE)

**Idiomas:** [English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · Español · [Português](README.pt.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md) · [中文](README.zh-CN.md)

---

## Por qué existe

Tres comportamientos medidos de AgentRouter hacen inútil una conexión directa para trabajo con agentes:

| Observación | Consecuencia |
|---|---|
| `/v1/messages` con herramientas **y** razonamiento devuelve `400` («use `/v1/responses`») | Claude Code no puede usar sus herramientas por la vía Anthropic |
| Codex CLI y Claude Desktop reciben `401 unauthorized client` | No deben hablar directamente con AgentRouter |
| `/v1/responses` acepta herramientas, razonamiento y streaming | Es la vía que funciona |

Por eso AgentAdapter traduce las peticiones en lugar de reenviarlas:

```
Claude Code ──Anthropic Messages──┐
Codex CLI ────OpenAI Responses───┼──► 127.0.0.1:8787 ──► agentrouter.org/v1/responses
Claude Desktop ──Anthropic───────┘        puente
```

El puente escucha solo en loopback, exige un token local y mantiene la clave real fuera de todas las configuraciones de cliente.

---

## Estado actual

| Área | Android / Termux | Windows / Linux |
|---|---|---|
| Claude Code con `cc-agent` | **Verificado en vivo**: texto, herramientas, creación y ejecución de archivos | Implementado, no ejecutado en Windows |
| Codex CLI con `codex-agent` | **Verificado en vivo**: texto, herramientas, creación de archivos | Implementado, no ejecutado en Windows |
| Menú de modelos en vivo | Verificado (interactivo y por tubería) | Implementado |
| Perfil de Claude Desktop | No aplica; la app no está aquí | Escritura/restauración **verificada con una carpeta simulada**; app real no probada |
| Servicio en segundo plano + inicio automático | Ausente a propósito (solo bajo demanda) | Implementado, no probado en Windows |
| Deshacer con un comando | Verificado para lanzadores | Implementado, no probado en Windows |

Pruebas y carencias: [`docs/STATUS.md`](../STATUS.md) y [`docs/VERIFICATION.md`](../VERIFICATION.md).

---

## Requisitos

- **Node.js 20 o superior** (probado con 24.22.1)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`) y/o **Codex CLI** (`npm install -g @openai/codex`)
- Una **clave API de AgentRouter** con acceso a al menos un modelo
- Claude Desktop solo si quieres la integración de escritorio

Sin dependencias de ejecución. El puente usa solo `http`, `fetch` y `crypto` de Node.

---

## Instalación

### Android / Termux

```bash
pkg install nodejs git
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
bash scripts/install.sh
```

Abre una shell nueva y ejecuta:

```bash
agentrouter login
cc-agent
codex-agent
```

En Android, `cc-agent` inicia el puente solo mientras dura la sesión. Después no queda nada corriendo.

El sandbox Bubblewrap de Codex no funciona en Termux/PRoot. `codex-agent` lo detecta, desactiva el sandbox y muestra un aviso. `AGENTROUTER_CODEX_SANDBOX=1` conserva tus propias opciones de Codex.

### Windows

```powershell
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

Abre una **nueva** ventana de PowerShell y ejecuta:

```powershell
agentrouter login
cc-agent
codex-agent
agentrouter desktop on
```

El instalador usa `%LOCALAPPDATA%\Programs\agentrouter`, añade esa carpeta al PATH **de usuario** y no necesita permisos de administrador.

Convivir con OmniRoute y CC-Switch: [`docs/WINDOWS.md`](../WINDOWS.md).

---

## Primer inicio

`agentrouter login` pide la clave sin mostrarla, la valida contra AgentRouter y la guarda en:

- Linux/Termux: `~/.config/agentrouter/credentials.json` (`0600`)
- Windows: `%APPDATA%\agentrouter\credentials.json`

Después, `cc-agent` muestra la lista real de modelos:

```
Claude Code model  ↑/↓, Enter, q
❯ gpt-5.6-sol        last used
  gpt-6-astra
  gpt-6.1-sol
```

Enter inicia Claude Code con ese modelo. `-m <id>` salta el menú; `--list` imprime la lista para scripts.

---

## Comandos

| Comando | Función |
|---|---|
| `agentrouter login` | Guardar y validar la clave |
| `agentrouter models` | Lista real de modelos (`--json`) |
| `agentrouter setup` | Configuración guiada; `--desktop` / `--autostart` |
| `agentrouter serve` | Ejecutar el puente en primer plano (`--port`, `--mode`) |
| `agentrouter status` | Clave, puente, modo, escritorio, inicio automático |
| `agentrouter doctor` | Diagnóstico completo (`--json`, `--quick`) |
| `agentrouter desktop on\|off\|status` | Gestionar el perfil de Claude Desktop |
| `agentrouter autostart on\|off` | Inicio al entrar (no en Termux) |
| `agentrouter undo` | Revertir todos los cambios (`--purge` borra clave y logs) |
| `cc-agent` | Menú y luego Claude Code |
| `codex-agent` | Menú y luego Codex con `CODEX_HOME` aislado |

Ambos lanzadores reenvían argumentos desconocidos: `cc-agent -m gpt-5.6-sol -p "..."`, `codex-agent exec --skip-git-repo-check "..."`.

---

## Claude Desktop

Claude Desktop solo lee la configuración de terceros al arrancar. AgentAdapter escribe un perfil propio y nunca toca los perfiles de CC-Switch.

```bash
agentrouter desktop on
# cierra Claude Desktop por completo (incluido el icono de la bandeja) y vuelve a abrirlo
```

Archivos escritos:

- Linux: `~/.config/Claude-3p/configLibrary/`
- Windows: `%LOCALAPPDATA%\Claude-3p\configLibrary\`
- macOS: `~/Library/Application Support/Claude-3p/`
- ID del perfil: `6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42`
- Gateway: `http://127.0.0.1:8787`
- Modelos: entradas explícitas, porque el descubrimiento automático solo acepta identificadores que parecen de Claude

`agentrouter desktop off` borra el perfil y restaura el `_meta.json` anterior. Después CC-Switch puede volver a mandar. Detalles: [`docs/CLAUDE-DESKTOP.md`](../CLAUDE-DESKTOP.md).

> **Aún no probado con la app real.** El ciclo de escritura, copia y restauración se probó con una carpeta simulada. Falta una ejecución en un equipo con Claude Desktop instalado.

---

## Windows con OmniRoute o CC-Switch

AgentAdapter no modifica `~/.claude/settings.json`, `~/.codex/config.toml` ni los archivos de CC-Switch.

- Una sesión normal de `claude` sigue usando OmniRoute/NVIDIA.
- `cc-agent` define `ANTHROPIC_BASE_URL` y el modelo **solo para su proceso hijo**.
- `codex-agent` usa un `CODEX_HOME` separado en `%LOCALAPPDATA%\agentrouter\codex`; tu perfil e historial de Codex quedan intactos.
- El perfil de escritorio es distinto del de CC-Switch; `desktop off` restaura el `appliedId` anterior.

Puedes clonar el repositorio y trabajar en él con Claude Code mientras este sigue enrutado por OmniRoute. Secuencia exacta: [`docs/WINDOWS.md`](../WINDOWS.md).

---

## Seguridad

- La clave API nunca entra en el repositorio, el perfil de escritorio, la configuración de Codex ni los argumentos de proceso.
- El puente escucha solo en `127.0.0.1` y exige un token local aleatorio (`0600`).
- Las peticiones salientes usan siempre la identificación de Claude CLI y `x-app: cli`.
- Los logs contienen modelo, estado, tokens y tiempos; nunca prompts, salidas de herramientas ni claves.
- El perfil de escritorio guarda el **token local del puente**, no la clave de AgentRouter.
- Si alguna vez compartiste una clave en un chat, issue o commit, rótala en AgentRouter.

Más: [`SECURITY.md`](../../SECURITY.md).

---

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `401 unauthorized client detected` | Cambió el filtro de cliente o un cliente evita el puente | `agentrouter doctor`; actualizar AgentAdapter |
| `400 Function tools with reasoning_effort are not supported` | La petición fue por la vía Anthropic | Usar el modo `stable`; el puente usa `/v1/responses` |
| Selector de modelos vacío en Claude Desktop | La app no se reinició del todo | Cerrar el icono de bandeja, reabrir, revisar `desktop status` |
| Codex termina con 182 en Termux | Sandbox Bubblewrap no disponible en PRoot | `codex-agent` lo desactiva; no pases `-s workspace-write` |
| `Port 8787 is already in use` | Otro puente o aplicación | `agentrouter serve --port 8788` |
| `claude: not found` | Falta la CLI | `npm install -g @anthropic-ai/claude-code` |
| Lista de modelos vacía | La clave no tiene modelos OpenAI | Revisar el grupo de la clave |

Logs: `~/.config/agentrouter/logs/agentrouter.log`. Empieza siempre con `agentrouter doctor`.

---

## Desarrollo

```bash
node --test
node bin/agentrouter.js doctor --quick
```

Estructura:

```
bin/              puntos de entrada
src/translate.js  conversión Anthropic ↔ Responses y máquina de estados SSE
src/server.js     puente HTTP local
src/agent.js      lógica común de cc-agent / codex-agent
src/desktop.js    perfil de Claude Desktop con copia de seguridad
src/doctor.js     diagnóstico en vivo
test/             18 pruebas con un upstream simulado
docs/             estado, registro de verificación, guías y especificación
```

Diseño original: [`docs/agentrouter-adapter-spec.md`](../agentrouter-adapter-spec.md). Para continuar con Claude Code u otro agente: [`AGENTS.md`](../../AGENTS.md).

---

## Estado y límites

Verificado en Android/Termux: autenticación, modelos en vivo, Claude Code con herramientas, Codex con herramientas, streaming, menú, token local, diagnóstico, mecánica del perfil de escritorio, instalador y deshacer.

No verificado en hardware: instalación e inicio automático en Windows, Claude Desktop con la app real, modo de razonamiento completo, inicio systemd en Linux.

No implementado a propósito: traducción de caché de prompts, `/v1/chat/completions`, interfaz gráfica, publicación en npm, servicio en segundo plano en Android.

Lista completa: [`docs/STATUS.md`](../STATUS.md).

---

## Licencia

MIT. Ver [`LICENSE`](../../LICENSE).
