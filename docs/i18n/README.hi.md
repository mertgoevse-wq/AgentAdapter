# AgentAdapter

**AgentRouter मॉडलों के साथ Claude Code, Codex CLI और Claude Desktop चलाएँ।**

AgentAdapter एक छोटा स्थानीय ब्रिज है। यह आपके टूल्स से Anthropic Messages और AgentRouter से OpenAI Responses की भाषा में बात करता है। यह वह क्लाइंट पहचान भी भेजता है जो AgentRouter मांगता है—Codex और Claude Desktop अकेले यह नहीं करते।

[![टेस्ट](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml/badge.svg)](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)](https://nodejs.org)
[![लाइसेंस](https://img.shields.io/badge/license-MIT-blue)](../../LICENSE)

**भाषाएँ:** [English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Türkçe](README.tr.md) · हिन्दी · [中文](README.zh-CN.md)

---

## यह क्यों बना

AgentRouter के तीन मापे गए व्यवहार सीधे कनेक्शन को एजेंट काम के लिए बेकार बनाते हैं:

| अवलोकन | परिणाम |
|---|---|
| टूल्स **और** रीज़निंग के साथ `/v1/messages` → `400` (“use `/v1/responses`”) | Claude Code Anthropic रास्ते से अपने टूल्स नहीं चला सकता |
| Codex CLI और Claude Desktop को `401 unauthorized client` | दोनों को सीधे AgentRouter से नहीं जुड़ना चाहिए |
| `/v1/responses` टूल्स, रीज़निंग और स्ट्रीमिंग स्वीकार करता है | यही काम करने वाला रास्ता है |

इसलिए AgentAdapter अनुरोध सिर्फ आगे नहीं भेजता, उन्हें अनुवादित करता है:

```
Claude Code ──Anthropic Messages──┐
Codex CLI ────OpenAI Responses───┼──► 127.0.0.1:8787 ──► agentrouter.org/v1/responses
Claude Desktop ──Anthropic───────┘        ब्रिज
```

ब्रिज केवल लूपबैक पर सुनता है, स्थानीय टोकन मांगता है और असली API कुंजी को किसी भी क्लाइंट कॉन्फ़िगरेशन से बाहर रखता है।

---

## आज क्या चलता है

| क्षेत्र | Android / Termux | Windows / Linux |
|---|---|---|
| `cc-agent` से Claude Code | **लाइव सत्यापित**: टेक्स्ट, टूल्स, फ़ाइल बनाना और चलाना | लागू, Windows पर नहीं चलाया |
| `codex-agent` से Codex CLI | **लाइव सत्यापित**: टेक्स्ट, टूल्स, फ़ाइल बनाना | लागू, Windows पर नहीं चलाया |
| लाइव मॉडल मेन्यू | सत्यापित (इंटरैक्टिव और पाइप) | लागू |
| Claude Desktop प्रोफ़ाइल | यहाँ लागू नहीं; ऐप उपलब्ध नहीं | लिखना/पुनर्स्थापित **नकली फ़ोल्डर से सत्यापित**; असली ऐप परीक्षण नहीं |
| बैकग्राउंड सेवा + ऑटोस्टार्ट | जानबूझकर नहीं (केवल मांग पर) | लागू, Windows पर परीक्षण नहीं |
| एक कमांड से वापसी | लॉन्चर के लिए सत्यापित | लागू, Windows पर परीक्षण नहीं |

प्रमाण और कमियाँ: [`docs/STATUS.md`](../STATUS.md) और [`docs/VERIFICATION.md`](../VERIFICATION.md).

---

## आवश्यकताएँ

- **Node.js 20 या नया** (24.22.1 से परीक्षण)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`) और/या **Codex CLI** (`npm install -g @openai/codex`)
- कम से कम एक मॉडल तक पहुँच वाली **AgentRouter API कुंजी**
- Claude Desktop केवल तब, जब डेस्कटॉप इंटीग्रेशन चाहिए

कोई रनटाइम निर्भरता नहीं। ब्रिज केवल Node के `http`, `fetch` और `crypto` उपयोग करता है।

---

## इंस्टॉल

### Android / Termux

```bash
pkg install nodejs git
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
bash scripts/install.sh
```

नया शेल खोलें, फिर:

```bash
agentrouter login
cc-agent
codex-agent
```

Android पर `cc-agent` ब्रिज केवल सत्र के दौरान चलाता है। बाद में कुछ नहीं चलता।

Codex का Bubblewrap सैंडबॉक्स Termux/PRoot में काम नहीं करता। `codex-agent` इसे पहचानकर सैंडबॉक्स बंद कर देता है और चेतावनी दिखाता है। `AGENTROUTER_CODEX_SANDBOX=1` आपके अपने Codex फ़्लैग सुरक्षित रखता है।

### Windows

```powershell
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

**नई** PowerShell विंडो खोलें, फिर:

```powershell
agentrouter login
cc-agent
codex-agent
agentrouter desktop on
```

इंस्टॉलर `%LOCALAPPDATA%\Programs\agentrouter` उपयोग करता है, फ़ोल्डर को केवल **उपयोगकर्ता** PATH में जोड़ता है और एडमिन अधिकार नहीं मांगता।

OmniRoute और CC-Switch के साथ उपयोग: [`docs/WINDOWS.md`](../WINDOWS.md).

---

## पहला रन

`agentrouter login` कुंजी बिना दिखाए मांगता है, AgentRouter पर जाँचता है और यहाँ सहेजता है:

- Linux/Termux: `~/.config/agentrouter/credentials.json` (`0600`)
- Windows: `%APPDATA%\agentrouter\credentials.json`

फिर `cc-agent` लाइव मॉडल सूची दिखाता है:

```
Claude Code model  ↑/↓, Enter, q
❯ gpt-5.6-sol        last used
  gpt-6-astra
  gpt-6.1-sol
```

Enter उस मॉडल से Claude Code शुरू करता है। `-m <id>` मेन्यू छोड़ता है; `--list` स्क्रिप्ट के लिए सूची छापता है।

---

## कमांड

| कमांड | काम |
|---|---|
| `agentrouter login` | कुंजी सहेजें और जाँचें |
| `agentrouter models` | लाइव मॉडल सूची (`--json`) |
| `agentrouter setup` | निर्देशित सेटअप; `--desktop` / `--autostart` |
| `agentrouter serve` | ब्रिज फ़ोरग्राउंड में चलाएँ (`--port`, `--mode`) |
| `agentrouter status` | कुंजी, ब्रिज, मोड, डेस्कटॉप, ऑटोस्टार्ट |
| `agentrouter doctor` | पूरा निदान (`--json`, `--quick`) |
| `agentrouter desktop on\|off\|status` | Claude Desktop प्रोफ़ाइल प्रबंधित करें |
| `agentrouter autostart on\|off` | लॉगिन पर शुरू (Termux में नहीं) |
| `agentrouter undo` | सभी बदलाव वापस (`--purge` कुंजी और लॉग भी हटाता है) |
| `cc-agent` | मेन्यू, फिर Claude Code |
| `codex-agent` | मेन्यू, फिर अलग `CODEX_HOME` के साथ Codex |

दोनों लॉन्चर अज्ञात आर्ग्युमेंट आगे भेजते हैं: `cc-agent -m gpt-5.6-sol -p "..."`, `codex-agent exec --skip-git-repo-check "..."`.

---

## Claude Desktop

Claude Desktop थर्ड-पार्टी सेटिंग्स केवल शुरू होने पर पढ़ता है। AgentAdapter अपनी अलग प्रोफ़ाइल लिखता है और CC-Switch प्रोफ़ाइल को नहीं छूता।

```bash
agentrouter desktop on
# Claude Desktop को पूरी तरह बंद करें (ट्रे आइकन सहित), फिर खोलें
```

लिखी जाने वाली फ़ाइलें:

- Linux: `~/.config/Claude-3p/configLibrary/`
- Windows: `%LOCALAPPDATA%\Claude-3p\configLibrary\`
- macOS: `~/Library/Application Support/Claude-3p/configLibrary/`
- प्रोफ़ाइल ID: `6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42`
- गेटवे: `http://127.0.0.1:8787`
- मॉडल: स्पष्ट प्रविष्टियाँ, क्योंकि स्वचालित खोज केवल Claude जैसी ID स्वीकार करती है

`agentrouter desktop off` प्रोफ़ाइल हटाता है और पिछली `_meta.json` वापस लाता है। फिर CC-Switch संभाल सकता है। विवरण: [`docs/CLAUDE-DESKTOP.md`](../CLAUDE-DESKTOP.md).

> **असली ऐप के साथ अभी सत्यापित नहीं।** प्रोफ़ाइल लिखने/बैकअप/वापसी का परीक्षण नकली फ़ोल्डर से हुआ। Windows ऐप का व्यवहार Claude Desktop वाले कंप्यूटर पर एक बार जाँचना बाकी है।

---

## OmniRoute या CC-Switch के साथ Windows

AgentAdapter `~/.claude/settings.json`, `~/.codex/config.toml` या CC-Switch फ़ाइलें नहीं बदलता।

- सामान्य `claude` सत्र OmniRoute/NVIDIA ही उपयोग करता रहता है।
- `cc-agent` `ANTHROPIC_BASE_URL` और मॉडल **केवल अपने चाइल्ड प्रोसेस** के लिए सेट करता है।
- `codex-agent` `%LOCALAPPDATA%\agentrouter\codex` में अलग `CODEX_HOME` उपयोग करता है; आपका सामान्य Codex प्रोफ़ाइल और इतिहास सुरक्षित रहता है।
- डेस्कटॉप प्रोफ़ाइल CC-Switch से अलग है; `desktop off` पिछली `appliedId` वापस लाता है।

इसलिए आप रिपॉज़िटरी क्लोन कर सकते हैं और Claude Code के OmniRoute से चलते हुए भी उसी से इस प्रोजेक्ट पर काम कर सकते हैं। पूरा क्रम: [`docs/WINDOWS.md`](../WINDOWS.md).

---

## सुरक्षा

- API कुंजी रिपॉज़िटरी, डेस्कटॉप प्रोफ़ाइल, Codex कॉन्फ़िग या प्रोसेस आर्ग्युमेंट में कभी नहीं जाती।
- ब्रिज केवल `127.0.0.1` पर सुनता है और यादृच्छिक स्थानीय टोकन मांगता है (`0600`)।
- बाहर जाने वाले अनुरोध हमेशा Claude CLI पहचान और `x-app: cli` भेजते हैं।
- लॉग में मॉडल, स्थिति, टोकन और समय होता है—प्रॉम्प्ट, टूल आउटपुट या कुंजी नहीं।
- डेस्कटॉप प्रोफ़ाइल **स्थानीय ब्रिज टोकन** रखती है, AgentRouter कुंजी नहीं।
- अगर कुंजी कभी चैट, इश्यू या कमिट में साझा हुई हो, तो AgentRouter में उसे बदलें।

अधिक: [`SECURITY.md`](../../SECURITY.md).

---

## समस्या हल

| लक्षण | कारण | समाधान |
|---|---|---|
| `401 unauthorized client detected` | क्लाइंट फ़िल्टर बदला या क्लाइंट ने ब्रिज छोड़ा | `agentrouter doctor`; AgentAdapter अपडेट करें |
| `400 Function tools with reasoning_effort are not supported` | अनुरोध Anthropic रास्ते से गया | `stable` मोड रखें; ब्रिज `/v1/responses` उपयोग करता है |
| Claude Desktop में मॉडल सूची खाली | ऐप पूरी तरह बंद नहीं हुआ | ट्रे आइकन बंद करें, फिर खोलें, `desktop status` देखें |
| Termux पर Codex 182 से बंद | Bubblewrap PRoot में उपलब्ध नहीं | `codex-agent` बंद कर देता है; `-s workspace-write` न दें |
| `Port 8787 is already in use` | दूसरा ब्रिज या ऐप | `agentrouter serve --port 8788` |
| `claude: not found` | CLI इंस्टॉल नहीं | `npm install -g @anthropic-ai/claude-code` |
| मॉडल सूची खाली | कुंजी के पास OpenAI मॉडल नहीं | AgentRouter में कुंजी समूह देखें |

लॉग: `~/.config/agentrouter/logs/agentrouter.log`. हमेशा पहले `agentrouter doctor` चलाएँ।

---

## विकास

```bash
node --test
node bin/agentrouter.js doctor --quick
```

संरचना:

```
bin/              CLI प्रवेश बिंदु
src/translate.js  Anthropic ↔ Responses रूपांतरण और SSE स्टेट मशीन
src/server.js     स्थानीय HTTP ब्रिज
src/agent.js      cc-agent / codex-agent साझा लॉजिक
src/desktop.js    Claude Desktop प्रोफ़ाइल और बैकअप
src/doctor.js     लाइव निदान
test/             नकली अपस्ट्रीम के साथ 18 टेस्ट
docs/             स्थिति, सत्यापन लॉग, Windows और Desktop गाइड, spec
```

मूल डिज़ाइन: [`docs/agentrouter-adapter-spec.md`](../agentrouter-adapter-spec.md). Claude Code या किसी अन्य एजेंट से आगे काम करने के लिए: [`AGENTS.md`](../../AGENTS.md).

---

## स्थिति और सीमाएँ

Android/Termux पर सत्यापित: लॉगिन, लाइव मॉडल, टूल्स के साथ Claude Code, टूल्स के साथ Codex, स्ट्रीमिंग, मॉडल मेन्यू, स्थानीय टोकन, निदान, डेस्कटॉप प्रोफ़ाइल मैकेनिक्स, इंस्टॉलर और वापसी।

हार्डवेयर पर सत्यापित नहीं: Windows इंस्टॉल और ऑटोस्टार्ट, असली Claude Desktop, पूरा रीज़निंग मोड, Linux systemd ऑटोस्टार्ट।

जानबूझकर नहीं बनाया: प्रॉम्प्ट कैश अनुवाद, `/v1/chat/completions`, GUI, npm प्रकाशन, Android पर बैकग्राउंड सेवा।

पूरी सूची: [`docs/STATUS.md`](../STATUS.md).

---

## लाइसेंस

MIT. देखें [`LICENSE`](../../LICENSE).
