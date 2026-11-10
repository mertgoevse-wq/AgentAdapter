# AgentAdapter

**Claude Code, Codex CLI ve Claude Desktop'ı AgentRouter modelleriyle çalıştırın.**

AgentAdapter küçük bir yerel köprüdür. Araçlarınızla Anthropic Messages, AgentRouter ile OpenAI Responses konuşur. Ayrıca AgentRouter'ın istediği istemci kimliğini gönderir; Codex ve Claude Desktop bunu kendiliğinden yapmaz.

[![Testler](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml/badge.svg)](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)](https://nodejs.org)
[![Lisans](https://img.shields.io/badge/license-MIT-blue)](../../LICENSE)

**Diller:** [English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · Türkçe · [हिन्दी](README.hi.md) · [中文](README.zh-CN.md)

---

## Neden var

AgentRouter'ın ölçülen üç davranışı, ajan işleri için doğrudan bağlantıyı kullanılamaz kılıyor:

| Gözlem | Sonuç |
|---|---|
| Araçlar **ve** akıl yürütme ile `/v1/messages` isteği `400` döndürüyor (“use `/v1/responses`”) | Claude Code araçlarını Anthropic yolundan kullanamıyor |
| Codex CLI ve Claude Desktop `401 unauthorized client` alıyor | İkisi de AgentRouter'a doğrudan bağlanmamalı |
| `/v1/responses` araçları, akıl yürütmeyi ve akışı kabul ediyor | Çalışan yol bu |

Bu yüzden AgentAdapter isteği yalnızca iletmez, çevirir:

```
Claude Code ──Anthropic Messages──┐
Codex CLI ────OpenAI Responses───┼──► 127.0.0.1:8787 ──► agentrouter.org/v1/responses
Claude Desktop ──Anthropic───────┘        köprü
```

Köprü yalnızca loopback üzerinde dinler, yerel bir jeton ister ve gerçek API anahtarını hiçbir istemci yapılandırmasına koymaz.

---

## Bugün çalışanlar

| Alan | Android / Termux | Windows / Linux |
|---|---|---|
| `cc-agent` ile Claude Code | **Canlı doğrulandı**: metin, araçlar, dosya oluşturma ve çalıştırma | Uygulandı, Windows'ta çalıştırılmadı |
| `codex-agent` ile Codex CLI | **Canlı doğrulandı**: metin, araçlar, dosya oluşturma | Uygulandı, Windows'ta çalıştırılmadı |
| Canlı model menüsü | Doğrulandı (etkileşimli ve boru hattı) | Uygulandı |
| Claude Desktop profili | Burada geçerli değil; uygulama yok | Yazma/geri yükleme **benzetilmiş klasörle doğrulandı**; gerçek uygulama test edilmedi |
| Arka plan servisi + otomatik başlatma | Bilerek yok (yalnızca istek üzerine) | Uygulandı, Windows'ta test edilmedi |
| Tek komutla geri alma | Başlatıcılar için doğrulandı | Uygulandı, Windows'ta test edilmedi |

Kanıtlar ve eksikler: [`docs/STATUS.md`](../STATUS.md) ve [`docs/VERIFICATION.md`](../VERIFICATION.md).

---

## Gereksinimler

- **Node.js 20 veya üzeri** (24.22.1 ile test edildi)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`) ve/veya **Codex CLI** (`npm install -g @openai/codex`)
- En az bir modele erişimi olan **AgentRouter API anahtarı**
- Claude Desktop yalnızca masaüstü entegrasyonu isteniyorsa

Çalışma zamanı bağımlılığı yok. Köprü yalnızca Node'un `http`, `fetch` ve `crypto` modüllerini kullanır.

---

## Kurulum

### Android / Termux

```bash
pkg install nodejs git
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
bash scripts/install.sh
```

Yeni bir kabuk açın, sonra:

```bash
agentrouter login
cc-agent
codex-agent
```

Android'de `cc-agent` köprüyü yalnızca oturum boyunca çalıştırır. Oturum bitince arka planda hiçbir şey kalmaz.

Codex'in Bubblewrap sandbox'ı Termux/PRoot altında çalışmaz. `codex-agent` bunu algılar, sandbox'ı kapatır ve uyarı verir. `AGENTROUTER_CODEX_SANDBOX=1` kendi Codex bayraklarınızı korur.

### Windows

```powershell
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

**Yeni** bir PowerShell penceresi açın, sonra:

```powershell
agentrouter login
cc-agent
codex-agent
agentrouter desktop on
```

Kurulum `%LOCALAPPDATA%\Programs\agentrouter` kullanır, klasörü yalnızca **kullanıcı** PATH'ine ekler ve yönetici hakkı istemez.

OmniRoute ve CC-Switch ile birlikte kullanım: [`docs/WINDOWS.md`](../WINDOWS.md).

---

## İlk çalıştırma

`agentrouter login` anahtarı görünmeden sorar, AgentRouter'da doğrular ve şuraya yazar:

- Linux/Termux: `~/.config/agentrouter/credentials.json` (`0600`)
- Windows: `%APPDATA%\agentrouter\credentials.json`

Sonra `cc-agent` canlı model listesini gösterir:

```
Claude Code model  ↑/↓, Enter, q
❯ gpt-5.6-sol        last used
  gpt-6-astra
  gpt-6.1-sol
```

Enter, Claude Code'u bu modelle başlatır. `-m <id>` menüyü atlar; `--list` betikler için listeyi yazdırır.

---

## Komutlar

| Komut | Amaç |
|---|---|
| `agentrouter login` | Anahtarı sakla ve doğrula |
| `agentrouter models` | Canlı model listesi (`--json`) |
| `agentrouter setup` | Yönlendirilmiş kurulum; `--desktop` / `--autostart` |
| `agentrouter serve` | Köprüyü ön planda çalıştır (`--port`, `--mode`) |
| `agentrouter status` | Anahtar, köprü, mod, masaüstü, otomatik başlatma |
| `agentrouter doctor` | Uçtan uca tanılama (`--json`, `--quick`) |
| `agentrouter desktop on\|off\|status` | Claude Desktop profilini yönet |
| `agentrouter autostart on\|off` | Oturum açılışında başlat (Termux'ta yok) |
| `agentrouter undo` | Tüm değişiklikleri geri al (`--purge` anahtarı da siler) |
| `cc-agent` | Menü, sonra Claude Code |
| `codex-agent` | Menü, sonra ayrı `CODEX_HOME` ile Codex |

İki başlatıcı da bilinmeyen argümanları iletir: `cc-agent -m gpt-5.6-sol -p "..."`, `codex-agent exec --skip-git-repo-check "..."`.

---

## Claude Desktop

Claude Desktop üçüncü taraf ayarlarını yalnızca açılışta okur. AgentAdapter kendi profilini yazar ve CC-Switch profillerine dokunmaz.

```bash
agentrouter desktop on
# Claude Desktop'ı tamamen kapatın (tepsi simgesi dahil), sonra yeniden açın
```

Yazılanlar:

- Linux: `~/.config/Claude-3p/configLibrary/`
- Windows: `%LOCALAPPDATA%\Claude-3p\configLibrary\`
- macOS: `~/Library/Application Support/Claude-3p/configLibrary/`
- Profil kimliği: `6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42`
- Ağ geçidi: `http://127.0.0.1:8787`
- Modeller: açık girdiler, çünkü otomatik keşif yalnızca Claude'a benzeyen kimlikleri kabul eder

`agentrouter desktop off` profili siler ve önceki `_meta.json` dosyasını geri yükler. CC-Switch yeniden devralabilir. Ayrıntılar: [`docs/CLAUDE-DESKTOP.md`](../CLAUDE-DESKTOP.md).

> **Gerçek uygulamayla henüz doğrulanmadı.** Profil yazma/yedekleme/geri yükleme benzetilmiş bir klasörle test edildi. Windows uygulamasının davranışı, Claude Desktop kurulu bir makinede bir kez denenmeli.

---

## OmniRoute veya CC-Switch yönlendirirken Windows

AgentAdapter `~/.claude/settings.json`, `~/.codex/config.toml` veya CC-Switch dosyalarını değiştirmez.

- Normal bir `claude` oturumu OmniRoute/NVIDIA kullanmaya devam eder.
- `cc-agent`, `ANTHROPIC_BASE_URL` ve modeli **yalnızca kendi alt süreci için** ayarlar.
- `codex-agent`, `%LOCALAPPDATA%\agentrouter\codex` altında ayrı bir `CODEX_HOME` kullanır; normal Codex profiliniz ve geçmişiniz bozulmaz.
- Masaüstü profili CC-Switch'ten ayrıdır; `desktop off` önceki `appliedId` değerini geri yükler.

Yani depoyu klonlayıp Claude Code hâlâ OmniRoute üzerinden giderken onunla bu proje üzerinde çalışabilirsiniz. Tam sıra: [`docs/WINDOWS.md`](../WINDOWS.md).

---

## Güvenlik

- API anahtarı depoya, masaüstü profiline, Codex yapılandırmasına veya süreç argümanlarına girmez.
- Köprü yalnızca `127.0.0.1` üzerinde dinler ve rastgele bir yerel jeton ister (`0600`).
- Giden istekler her zaman Claude CLI kimliğini ve `x-app: cli` başlığını kullanır.
- Günlükler model, durum, jeton sayıları ve süreler içerir; istem, araç çıktısı veya anahtar içermez.
- Masaüstü profili **yerel köprü jetonunu** saklar, AgentRouter anahtarını değil.
- Bir anahtar sohbette, sorunda veya commit'te paylaşıldıysa AgentRouter'da iptal edin.

Daha fazlası: [`SECURITY.md`](../../SECURITY.md).

---

## Sorun giderme

| Belirti | Neden | Çözüm |
|---|---|---|
| `401 unauthorized client detected` | İstemci filtresi değişti veya istemci köprüyü atladı | `agentrouter doctor`; AgentAdapter'ı güncelle |
| `400 Function tools with reasoning_effort are not supported` | İstek Anthropic yolundan gitti | `stable` modunda kalın; köprü `/v1/responses` kullanır |
| Claude Desktop model listesi boş | Uygulama tam kapatılmadı | Tepsi simgesini kapatın, yeniden açın, `desktop status` |
| Termux'ta Codex 182 ile bitiyor | Bubblewrap PRoot'ta çalışmıyor | `codex-agent` kapatır; `-s workspace-write` vermeyin |
| `Port 8787 is already in use` | Başka köprü veya uygulama | `agentrouter serve --port 8788` |
| `claude: not found` | CLI kurulu değil | `npm install -g @anthropic-ai/claude-code` |
| Model listesi boş | Anahtarın OpenAI modeli yok | AgentRouter'daki anahtar grubunu kontrol edin |

Günlükler: `~/.config/agentrouter/logs/agentrouter.log`. Her zaman önce `agentrouter doctor` çalıştırın.

---

## Geliştirme

```bash
node --test
node bin/agentrouter.js doctor --quick
```

Yapı:

```
bin/              CLI giriş noktaları
src/translate.js  Anthropic ↔ Responses dönüşümü ve SSE durum makinesi
src/server.js     yerel HTTP köprüsü
src/agent.js      cc-agent / codex-agent ortak akışı
src/desktop.js    Claude Desktop profili ve yedekleme
src/doctor.js     canlı tanılama
test/             benzetilmiş upstream ile 18 test
docs/             durum, doğrulama kaydı, Windows ve Desktop kılavuzları, spec
```

Özgün tasarım: [`docs/agentrouter-adapter-spec.md`](../agentrouter-adapter-spec.md). Claude Code veya başka bir ajanla devam edecekseniz: [`AGENTS.md`](../../AGENTS.md).

---

## Durum ve sınırlar

Android/Termux'ta doğrulandı: kimlik doğrulama, canlı modeller, araçlarla Claude Code, araçlarla Codex, akış, model menüsü, yerel jeton, tanılama, masaüstü profil mekaniği, kurulum ve geri alma.

Donanımda doğrulanmadı: Windows kurulumu ve otomatik başlatma, gerçek Claude Desktop uygulaması, tam akıl yürütme modu, Linux systemd otomatik başlatma.

Bilerek yapılmadı: istem önbelleği çevirisi, `/v1/chat/completions`, GUI, npm yayını, Android'de arka plan servisi.

Tam liste: [`docs/STATUS.md`](../STATUS.md).

---

## Lisans

MIT. Bkz. [`LICENSE`](../../LICENSE).
