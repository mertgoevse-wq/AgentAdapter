# AgentAdapter

**Claude Code, Codex CLI e Claude Desktop com modelos da AgentRouter.**

AgentAdapter é uma pequena ponte local. Ela fala Anthropic Messages com suas ferramentas e OpenAI Responses com a AgentRouter. Também envia a identificação de cliente que a AgentRouter exige — algo que o Codex e o Claude Desktop não fazem sozinhos.

[![Testes](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml/badge.svg)](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)](https://nodejs.org)
[![Licença](https://img.shields.io/badge/license-MIT-blue)](../../LICENSE)

**Idiomas:** [English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · Português · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md) · [中文](README.zh-CN.md)

---

## Por que existe

Três comportamentos medidos da AgentRouter tornam a conexão direta inútil para trabalho com agentes:

| Observação | Consequência |
|---|---|
| `/v1/messages` com ferramentas **e** raciocínio retorna `400` (“use `/v1/responses`”) | O Claude Code não consegue usar ferramentas pelo caminho Anthropic |
| Codex CLI e Claude Desktop recebem `401 unauthorized client` | Eles não devem falar diretamente com a AgentRouter |
| `/v1/responses` aceita ferramentas, raciocínio e streaming | É o caminho que funciona |

Por isso a AgentAdapter traduz as requisições em vez de apenas repassá-las:

```
Claude Code ──Anthropic Messages──┐
Codex CLI ────OpenAI Responses───┼──► 127.0.0.1:8787 ──► agentrouter.org/v1/responses
Claude Desktop ──Anthropic───────┘        ponte
```

A ponte escuta apenas em loopback, exige um token local e mantém a chave real fora de qualquer configuração de cliente.

---

## Estado atual

| Área | Android / Termux | Windows / Linux |
|---|---|---|
| Claude Code via `cc-agent` | **Verificado ao vivo**: texto, ferramentas, criação e execução de arquivo | Implementado, não executado no Windows |
| Codex CLI via `codex-agent` | **Verificado ao vivo**: texto, ferramentas, criação de arquivo | Implementado, não executado no Windows |
| Menu de modelos ao vivo | Verificado (interativo e por pipe) | Implementado |
| Perfil do Claude Desktop | Não se aplica; app indisponível | Gravação/restauração **verificada com pasta simulada**; app real não testado |
| Serviço em segundo plano + autostart | Ausente de propósito (sob demanda) | Implementado, não testado no Windows |
| Desfazer com um comando | Verificado para os lançadores | Implementado, não testado no Windows |

Evidências e lacunas: [`docs/STATUS.md`](../STATUS.md) e [`docs/VERIFICATION.md`](../VERIFICATION.md).

---

## Requisitos

- **Node.js 20 ou superior** (testado com 24.22.1)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`) e/ou **Codex CLI** (`npm install -g @openai/codex`)
- Uma **chave de API da AgentRouter** com acesso a pelo menos um modelo
- Claude Desktop apenas para a integração de desktop

Sem dependências de execução. A ponte usa somente `http`, `fetch` e `crypto` do Node.

---

## Instalação

### Android / Termux

```bash
pkg install nodejs git
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
bash scripts/install.sh
```

Abra um novo shell e execute:

```bash
agentrouter login
cc-agent
codex-agent
```

No Android, o `cc-agent` inicia a ponte apenas durante a sessão. Nada continua rodando depois.

O sandbox Bubblewrap do Codex não funciona no Termux/PRoot. O `codex-agent` detecta isso, desativa o sandbox e mostra um aviso. `AGENTROUTER_CODEX_SANDBOX=1` mantém suas próprias opções do Codex.

### Windows

```powershell
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

Abra uma **nova** janela do PowerShell e execute:

```powershell
agentrouter login
cc-agent
codex-agent
agentrouter desktop on
```

O instalador usa `%LOCALAPPDATA%\Programs\agentrouter`, adiciona a pasta ao PATH **do usuário** e não exige administrador.

Convivência com OmniRoute e CC-Switch: [`docs/WINDOWS.md`](../WINDOWS.md).

---

## Primeiro uso

`agentrouter login` pede a chave sem exibi-la, valida na AgentRouter e grava em:

- Linux/Termux: `~/.config/agentrouter/credentials.json` (`0600`)
- Windows: `%APPDATA%\agentrouter\credentials.json`

Depois, `cc-agent` mostra a lista real de modelos:

```
Claude Code model  ↑/↓, Enter, q
❯ gpt-5.6-sol        last used
  gpt-6-astra
  gpt-6.1-sol
```

Enter inicia o Claude Code com esse modelo. `-m <id>` pula o menu; `--list` imprime a lista para scripts.

---

## Comandos

| Comando | Função |
|---|---|
| `agentrouter login` | Gravar e validar a chave |
| `agentrouter models` | Lista real de modelos (`--json`) |
| `agentrouter setup` | Configuração guiada; `--desktop` / `--autostart` |
| `agentrouter serve` | Rodar a ponte em primeiro plano (`--port`, `--mode`) |
| `agentrouter status` | Chave, ponte, modo, desktop, autostart |
| `agentrouter doctor` | Diagnóstico completo (`--json`, `--quick`) |
| `agentrouter desktop on\|off\|status` | Gerenciar o perfil do Claude Desktop |
| `agentrouter autostart on\|off` | Iniciar no login (não no Termux) |
| `agentrouter undo` | Reverter tudo (`--purge` apaga chave e logs) |
| `cc-agent` | Menu e depois Claude Code |
| `codex-agent` | Menu e depois Codex com `CODEX_HOME` isolado |

Os dois lançadores repassam argumentos desconhecidos: `cc-agent -m gpt-5.6-sol -p "..."`, `codex-agent exec --skip-git-repo-check "..."`.

---

## Claude Desktop

O Claude Desktop só lê a configuração de terceiros ao iniciar. A AgentAdapter grava um perfil próprio e nunca altera os perfis do CC-Switch.

```bash
agentrouter desktop on
# feche o Claude Desktop por completo (incluindo o ícone da bandeja) e abra de novo
```

Arquivos gravados:

- Linux: `~/.config/Claude-3p/configLibrary/`
- Windows: `%LOCALAPPDATA%\Claude-3p\configLibrary\`
- macOS: `~/Library/Application Support/Claude-3p/configLibrary/`
- ID do perfil: `6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42`
- Gateway: `http://127.0.0.1:8787`
- Modelos: entradas explícitas, pois a descoberta automática só aceita IDs que parecem Claude

`agentrouter desktop off` remove o perfil e restaura o `_meta.json` anterior. O CC-Switch pode assumir de novo. Detalhes: [`docs/CLAUDE-DESKTOP.md`](../CLAUDE-DESKTOP.md).

> **Ainda não verificado com o app real.** O ciclo de gravação, backup e restauração foi testado com uma pasta simulada. Falta uma execução em uma máquina com Claude Desktop.

---

## Windows com OmniRoute ou CC-Switch

A AgentAdapter não altera `~/.claude/settings.json`, `~/.codex/config.toml` nem os arquivos do CC-Switch.

- Uma sessão normal de `claude` continua usando OmniRoute/NVIDIA.
- O `cc-agent` define `ANTHROPIC_BASE_URL` e o modelo **apenas para o processo filho**.
- O `codex-agent` usa um `CODEX_HOME` separado em `%LOCALAPPDATA%\agentrouter\codex`; seu perfil e histórico do Codex ficam intactos.
- O perfil de desktop é separado do CC-Switch; `desktop off` restaura o `appliedId` anterior.

Você pode clonar o repositório e trabalhar nele com Claude Code enquanto ele continua roteado pelo OmniRoute. Sequência exata: [`docs/WINDOWS.md`](../WINDOWS.md).

---

## Segurança

- A chave de API nunca entra no repositório, no perfil de desktop, na configuração do Codex ou nos argumentos do processo.
- A ponte escuta apenas em `127.0.0.1` e exige um token local aleatório (`0600`).
- Requisições de saída usam sempre a identificação do Claude CLI e `x-app: cli`.
- Os logs contêm modelo, status, tokens e tempos; nunca prompts, saídas de ferramentas ou chaves.
- O perfil de desktop guarda o **token local da ponte**, não a chave da AgentRouter.
- Se uma chave foi compartilhada em chat, issue ou commit, rotacione-a na AgentRouter.

Mais: [`SECURITY.md`](../../SECURITY.md).

---

## Solução de problemas

| Sintoma | Causa | Correção |
|---|---|---|
| `401 unauthorized client detected` | Filtro de cliente mudou, ou cliente ignorou a ponte | `agentrouter doctor`; atualizar a AgentAdapter |
| `400 Function tools with reasoning_effort are not supported` | Requisição passou pelo caminho Anthropic | Manter o modo `stable`; a ponte usa `/v1/responses` |
| Lista de modelos vazia no Claude Desktop | App não reiniciou por completo | Fechar o ícone da bandeja, abrir de novo, ver `desktop status` |
| Codex termina com 182 no Termux | Sandbox Bubblewrap indisponível no PRoot | O `codex-agent` desativa; não passe `-s workspace-write` |
| `Port 8787 is already in use` | Outra ponte ou app | `agentrouter serve --port 8788` |
| `claude: not found` | CLI ausente | `npm install -g @anthropic-ai/claude-code` |
| Lista vazia | A chave não tem modelos OpenAI | Verificar o grupo da chave |

Logs: `~/.config/agentrouter/logs/agentrouter.log`. Comece sempre com `agentrouter doctor`.

---

## Desenvolvimento

```bash
node --test
node bin/agentrouter.js doctor --quick
```

Estrutura:

```
bin/              entradas de CLI
src/translate.js  conversão Anthropic ↔ Responses e máquina de estados SSE
src/server.js     ponte HTTP local
src/agent.js      lógica comum cc-agent / codex-agent
src/desktop.js    perfil do Claude Desktop com backup
src/doctor.js     diagnóstico ao vivo
test/             18 testes com upstream simulado
docs/             status, registro de verificação, guias e especificação
```

Desenho original: [`docs/agentrouter-adapter-spec.md`](../agentrouter-adapter-spec.md). Para continuar com Claude Code ou outro agente: [`AGENTS.md`](../../AGENTS.md).

---

## Estado e limites

Verificado no Android/Termux: autenticação, modelos ao vivo, Claude Code com ferramentas, Codex com ferramentas, streaming, menu, token local, diagnóstico, mecânica do perfil de desktop, instalador e desfazer.

Não verificado em hardware: instalação e autostart no Windows, Claude Desktop com o app real, modo de raciocínio completo, autostart systemd no Linux.

Não implementado de propósito: tradução de cache de prompt, `/v1/chat/completions`, interface gráfica, publicação no npm, serviço em segundo plano no Android.

Lista completa: [`docs/STATUS.md`](../STATUS.md).

---

## Licença

MIT. Veja [`LICENSE`](../../LICENSE).
