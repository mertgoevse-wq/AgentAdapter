# AgentAdapter

**在 AgentRouter 模型上运行 Claude Code、Codex CLI 和 Claude Desktop。**

AgentAdapter 是一个本地小型桥接器：对工具说 Anthropic Messages，对 AgentRouter 说 OpenAI Responses，并发送 AgentRouter 要求的客户端标识——Codex 和 Claude Desktop 自己不会发送。

[![测试](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml/badge.svg)](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)](https://nodejs.org)
[![许可证](https://img.shields.io/badge/license-MIT-blue)](../../LICENSE)

**语言：** [English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md) · 中文

---

## 为什么需要它

实测发现 AgentRouter 的三个行为让直连无法用于智能体任务：

| 观察 | 后果 |
|---|---|
| `/v1/messages` 同时带工具**和**推理时返回 `400`（“use `/v1/responses`”） | Claude Code 无法通过 Anthropic 路径使用工具 |
| Codex CLI 和 Claude Desktop 收到 `401 unauthorized client` | 它们不能直连 AgentRouter |
| `/v1/responses` 支持函数工具、推理和流式输出 | 这是可用的路径 |

因此 AgentAdapter 不只是转发，而是翻译请求：

```
Claude Code ──Anthropic Messages──┐
Codex CLI ────OpenAI Responses───┼──► 127.0.0.1:8787 ──► agentrouter.org/v1/responses
Claude Desktop ──Anthropic───────┘        桥接器
```

桥接器只监听回环地址，要求本地令牌，并把真实 API 密钥隔离在所有客户端配置之外。

---

## 当前可用状态

| 领域 | Android / Termux | Windows / Linux |
|---|---|---|
| 通过 `cc-agent` 使用 Claude Code | **实机验证**：文本、工具、创建并运行文件 | 已实现，未在 Windows 硬件上运行 |
| 通过 `codex-agent` 使用 Codex CLI | **实机验证**：文本、工具、创建文件 | 已实现，未在 Windows 硬件上运行 |
| 实时模型菜单 | 已验证（交互和管道） | 已实现 |
| Claude Desktop 配置 | 此处不适用，未安装应用 | 写入/恢复**已用模拟目录验证**；真实应用未测试 |
| 后台服务 + 开机自启 | 有意不提供（仅按需启动） | 已实现，Windows 未测试 |
| 一条命令撤销 | 启动器已验证 | 已实现，Windows 未测试 |

证据与缺口：[`docs/STATUS.md`](../STATUS.md) 和 [`docs/VERIFICATION.md`](../VERIFICATION.md)。

---

## 要求

- **Node.js 20 或更高**（使用 24.22.1 测试）
- **Claude Code**（`npm install -g @anthropic-ai/claude-code`）和/或 **Codex CLI**（`npm install -g @openai/codex`）
- 至少能访问一个模型的 **AgentRouter API 密钥**
- 仅在需要桌面集成时安装 Claude Desktop

无运行时依赖。桥接器只使用 Node 内置的 `http`、`fetch` 和 `crypto`。

---

## 安装

### Android / Termux

```bash
pkg install nodejs git
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
bash scripts/install.sh
```

打开新终端，然后：

```bash
agentrouter login
cc-agent
codex-agent
```

在 Android 上，`cc-agent` 只在会话期间启动桥接器，退出后不会留下后台进程。

Codex 的 Bubblewrap 沙箱在 Termux/PRoot 下无法运行。`codex-agent` 会检测到并关闭沙箱，同时打印警告。设置 `AGENTROUTER_CODEX_SANDBOX=1` 可保留你自己的 Codex 参数。

### Windows

```powershell
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

打开**新的** PowerShell 窗口，然后：

```powershell
agentrouter login
cc-agent
codex-agent
agentrouter desktop on
```

安装器使用 `%LOCALAPPDATA%\Programs\agentrouter`，只把该目录加入**用户** PATH，不需要管理员权限。

与 OmniRoute、CC-Switch 共存：[`docs/WINDOWS.md`](../WINDOWS.md)。

---

## 首次运行

`agentrouter login` 以隐藏输入方式询问密钥，向 AgentRouter 验证后保存到：

- Linux/Termux：`~/.config/agentrouter/credentials.json`（`0600`）
- Windows：`%APPDATA%\agentrouter\credentials.json`

随后 `cc-agent` 显示实时模型列表：

```
Claude Code model  ↑/↓, Enter, q
❯ gpt-5.6-sol        last used
  gpt-6-astra
  gpt-6.1-sol
```

按 Enter 使用该模型启动 Claude Code。`-m <id>` 跳过菜单；`--list` 输出脚本可用的列表。

---

## 命令

| 命令 | 作用 |
|---|---|
| `agentrouter login` | 保存并验证密钥 |
| `agentrouter models` | 实时模型列表（`--json`） |
| `agentrouter setup` | 引导式设置；可加 `--desktop` / `--autostart` |
| `agentrouter serve` | 前台运行桥接器（`--port`、`--mode`） |
| `agentrouter status` | 密钥、服务、模式、桌面、自启状态 |
| `agentrouter doctor` | 端到端诊断（`--json`、`--quick`） |
| `agentrouter desktop on\|off\|status` | 管理 Claude Desktop 配置 |
| `agentrouter autostart on\|off` | 登录时启动（Termux 不支持） |
| `agentrouter undo` | 撤销所有更改（`--purge` 同时删除密钥和日志） |
| `cc-agent` | 选择模型后启动 Claude Code |
| `codex-agent` | 选择模型后用独立 `CODEX_HOME` 启动 Codex |

两个启动器都会透传未知参数：`cc-agent -m gpt-5.6-sol -p "..."`、`codex-agent exec --skip-git-repo-check "..."`。

---

## Claude Desktop

Claude Desktop 只在启动时读取第三方推理配置。AgentAdapter 写入独立配置，绝不修改 CC-Switch 的配置。

```bash
agentrouter desktop on
# 完全退出 Claude Desktop（包括托盘图标），然后重新打开
```

写入内容：

- Linux：`~/.config/Claude-3p/configLibrary/`
- Windows：`%LOCALAPPDATA%\Claude-3p\configLibrary\`
- macOS：`~/Library/Application Support/Claude-3p/configLibrary/`
- 配置 ID：`6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42`
- 网关：`http://127.0.0.1:8787`
- 模型：显式条目，因为自动发现只接受看起来像 Claude 的 ID

`agentrouter desktop off` 会删除配置并恢复之前的 `_meta.json`，CC-Switch 可以重新接管。详见 [`docs/CLAUDE-DESKTOP.md`](../CLAUDE-DESKTOP.md)。

> **尚未用真实应用验证。** 写入、备份和恢复流程使用模拟目录测试；Windows 应用的实际行为还需要在装有 Claude Desktop 的电脑上运行一次。

---

## 在 OmniRoute 或 CC-Switch 路由时使用 Windows

AgentAdapter 不会修改 `~/.claude/settings.json`、`~/.codex/config.toml` 或 CC-Switch 文件。

- 普通 `claude` 会话继续使用 OmniRoute/NVIDIA。
- `cc-agent` **只为自己的子进程**设置 `ANTHROPIC_BASE_URL` 和模型。
- `codex-agent` 使用 `%LOCALAPPDATA%\agentrouter\codex` 下的独立 `CODEX_HOME`；原有 Codex 配置和历史不受影响。
- 桌面配置与 CC-Switch 分离；`desktop off` 恢复之前的 `appliedId`。

因此你可以在 Claude Code 仍走 OmniRoute 的情况下克隆仓库并用它开发本项目。完整顺序见 [`docs/WINDOWS.md`](../WINDOWS.md)。

---

## 安全

- API 密钥不会进入仓库、桌面配置、Codex 配置或进程参数。
- 桥接器只监听 `127.0.0.1`，并要求随机本地令牌（`0600`）。
- 上游请求始终使用 Claude CLI 标识和 `x-app: cli`。
- 日志只包含模型、状态、令牌数和耗时，不含提示词、工具输出或密钥。
- 桌面配置保存的是**本地桥接令牌**，不是 AgentRouter 密钥。
- 如果密钥曾在聊天、issue 或提交中公开，请在 AgentRouter 中轮换。

更多：[`SECURITY.md`](../../SECURITY.md)。

---

## 故障排查

| 症状 | 原因 | 处理 |
|---|---|---|
| `401 unauthorized client detected` | 上游客户端限制变化，或客户端绕过桥接器 | `agentrouter doctor`；更新 AgentAdapter |
| `400 Function tools with reasoning_effort are not supported` | 请求走了 Anthropic 路径 | 保持 `stable` 模式；桥接器使用 `/v1/responses` |
| Claude Desktop 模型列表为空 | 应用没有完全重启 | 退出托盘图标，重新打开，检查 `desktop status` |
| Termux 上 Codex 退出码 182 | PRoot 中 Bubblewrap 不可用 | `codex-agent` 会自动关闭；不要传 `-s workspace-write` |
| `Port 8787 is already in use` | 其他桥接器或应用占用 | `agentrouter serve --port 8788` |
| `claude: not found` | 未安装 CLI | `npm install -g @anthropic-ai/claude-code` |
| 模型列表为空 | 密钥没有 OpenAI 模型 | 检查 AgentRouter 中的密钥分组 |

日志：`~/.config/agentrouter/logs/agentrouter.log`。先运行 `agentrouter doctor`。

---

## 开发

```bash
node --test
node bin/agentrouter.js doctor --quick
```

结构：

```
bin/              CLI 入口
src/translate.js  Anthropic ↔ Responses 转换与 SSE 状态机
src/server.js     本地 HTTP 桥接器
src/agent.js      cc-agent / codex-agent 共享逻辑
src/desktop.js    Claude Desktop 配置与备份
src/doctor.js     实时诊断
test/             18 个使用模拟上游的测试
docs/             状态、验证记录、Windows 与桌面指南、设计文档
```

原始设计：[`docs/agentrouter-adapter-spec.md`](../agentrouter-adapter-spec.md)。用 Claude Code 或其他智能体继续开发时先读：[`AGENTS.md`](../../AGENTS.md)。

---

## 状态与限制

已在 Android/Termux 验证：登录、实时模型、带工具的 Claude Code、带工具的 Codex、流式输出、模型菜单、本地令牌、诊断、桌面配置机制、安装器和撤销。

未在硬件上验证：Windows 安装与自启、真实 Claude Desktop、完整推理模式、Linux systemd 自启。

有意未实现：提示缓存转换、`/v1/chat/completions`、图形界面、npm 发布、Android 后台服务。

完整列表：[`docs/STATUS.md`](../STATUS.md)。

---

## 许可证

MIT。见 [`LICENSE`](../../LICENSE)。
