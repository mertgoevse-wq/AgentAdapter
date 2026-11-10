# AgentAdapter

**Claude Code, Codex CLI et Claude Desktop avec les modèles AgentRouter.**

AgentAdapter est un petit pont local. Il parle Anthropic Messages à vos outils et OpenAI Responses à AgentRouter. Il envoie aussi l'identification client qu'AgentRouter exige, ce que Codex et Claude Desktop ne font pas seuls.

[![Tests](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml/badge.svg)](https://github.com/mertgoevse-wq/AgentAdapter/actions/workflows/test.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)](https://nodejs.org)
[![Licence](https://img.shields.io/badge/license-MIT-blue)](../../LICENSE)

**Langues :** [English](../../README.md) · [Deutsch](README.de.md) · Français · [Español](README.es.md) · [Português](README.pt.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md) · [中文](README.zh-CN.md)

---

## Pourquoi ce projet

Trois comportements mesurés d'AgentRouter rendent une connexion directe inutilisable pour le travail agentique :

| Observation | Conséquence |
|---|---|
| `/v1/messages` avec outils **et** raisonnement renvoie `400` (« use `/v1/responses` ») | Claude Code ne peut pas utiliser ses outils par le chemin Anthropic |
| Codex CLI et Claude Desktop reçoivent `401 unauthorized client` | Ils ne doivent pas parler directement à AgentRouter |
| `/v1/responses` accepte les outils, le raisonnement et le streaming | C'est le chemin qui fonctionne |

AgentAdapter traduit donc les requêtes au lieu de les transmettre :

```
Claude Code ──Anthropic Messages──┐
Codex CLI ────OpenAI Responses───┼──► 127.0.0.1:8787 ──► agentrouter.org/v1/responses
Claude Desktop ──Anthropic───────┘        pont
```

Le pont n'écoute que sur la boucle locale, exige un jeton local et garde la vraie clé API hors de toute configuration client.

---

## État actuel

| Domaine | Android / Termux | Windows / Linux |
|---|---|---|
| Claude Code via `cc-agent` | **Vérifié en direct** : texte, outils, création et exécution de fichier | Implémenté, non exécuté sur Windows |
| Codex CLI via `codex-agent` | **Vérifié en direct** : texte, outils, création de fichier | Implémenté, non exécuté sur Windows |
| Menu des modèles en direct | Vérifié (interactif et par pipe) | Implémenté |
| Profil Claude Desktop | Non applicable ; application absente | Écriture/restauration **vérifiée avec un dossier simulé** ; application réelle non testée |
| Service d'arrière-plan + démarrage auto | Volontairement absent (à la demande) | Implémenté, non testé sur Windows |
| Annulation en une commande | Vérifiée pour les lanceurs | Implémentée, non testée sur Windows |

Preuves et lacunes : [`docs/STATUS.md`](../STATUS.md) et [`docs/VERIFICATION.md`](../VERIFICATION.md).

---

## Prérequis

- **Node.js 20 ou plus** (testé avec 24.22.1)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`) et/ou **Codex CLI** (`npm install -g @openai/codex`)
- Une **clé API AgentRouter** donnant accès à au moins un modèle
- Claude Desktop uniquement pour l'intégration bureau

Aucune dépendance d'exécution. Le pont utilise uniquement `http`, `fetch` et `crypto` de Node.

---

## Installation

### Android / Termux

```bash
pkg install nodejs git
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
bash scripts/install.sh
```

Ouvrez un nouveau shell, puis :

```bash
agentrouter login
cc-agent
codex-agent
```

Sur Android, `cc-agent` ne démarre le pont que pendant la session. Rien ne reste en arrière-plan.

Le bac à sable Bubblewrap de Codex ne fonctionne pas sous Termux/PRoot. `codex-agent` le détecte, désactive le bac à sable et affiche un avertissement. `AGENTROUTER_CODEX_SANDBOX=1` conserve vos propres options Codex.

### Windows

```powershell
git clone https://github.com/mertgoevse-wq/AgentAdapter.git
cd AgentAdapter
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
```

Ouvrez une **nouvelle** fenêtre PowerShell, puis :

```powershell
agentrouter login
cc-agent
codex-agent
agentrouter desktop on
```

L'installateur utilise `%LOCALAPPDATA%\Programs\agentrouter`, ajoute ce dossier au PATH **utilisateur** et ne demande aucun droit administrateur.

La coexistence avec OmniRoute et CC-Switch est décrite dans [`docs/WINDOWS.md`](../WINDOWS.md).

---

## Premier lancement

`agentrouter login` demande la clé sans écho, la vérifie auprès d'AgentRouter et l'enregistre dans :

- Linux/Termux : `~/.config/agentrouter/credentials.json` (`0600`)
- Windows : `%APPDATA%\agentrouter\credentials.json`

Ensuite, `cc-agent` affiche la liste réelle des modèles :

```
Claude Code model  ↑/↓, Enter, q
❯ gpt-5.6-sol        last used
  gpt-6-astra
  gpt-6.1-sol
```

Entrée lance Claude Code avec ce modèle. `-m <id>` saute le menu, `--list` affiche la liste pour les scripts.

---

## Commandes

| Commande | Rôle |
|---|---|
| `agentrouter login` | Enregistrer et vérifier la clé |
| `agentrouter models` | Liste réelle des modèles (`--json`) |
| `agentrouter setup` | Installation guidée ; `--desktop` / `--autostart` |
| `agentrouter serve` | Lancer le pont au premier plan (`--port`, `--mode`) |
| `agentrouter status` | Clé, pont, mode, bureau, démarrage auto |
| `agentrouter doctor` | Diagnostic complet (`--json`, `--quick`) |
| `agentrouter desktop on\|off\|status` | Gérer le profil Claude Desktop |
| `agentrouter autostart on\|off` | Démarrage à l'ouverture de session (pas sur Termux) |
| `agentrouter undo` | Annuler toutes les modifications (`--purge` supprime aussi la clé) |
| `cc-agent` | Menu, puis Claude Code |
| `codex-agent` | Menu, puis Codex avec un `CODEX_HOME` isolé |

Les deux lanceurs transmettent les arguments inconnus : `cc-agent -m gpt-5.6-sol -p "..."`, `codex-agent exec --skip-git-repo-check "..."`.

---

## Claude Desktop

Claude Desktop ne lit la configuration tierce qu'au démarrage. AgentAdapter écrit un profil distinct et ne touche jamais aux profils CC-Switch.

```bash
agentrouter desktop on
# quitter complètement Claude Desktop (icône de la barre d'état incluse), puis rouvrir
```

Fichiers écrits :

- Linux : `~/.config/Claude-3p/configLibrary/`
- Windows : `%LOCALAPPDATA%\Claude-3p\configLibrary\`
- macOS : `~/Library/Application Support/Claude-3p/configLibrary/`
- ID du profil : `6c1d9a2e-4f3b-4c7a-9d21-8a7e5f0b1c42`
- Passerelle : `http://127.0.0.1:8787`
- Modèles : entrées explicites, car la découverte automatique n'accepte que des identifiants ressemblant à Claude

`agentrouter desktop off` supprime le profil et restaure le `_meta.json` précédent. CC-Switch peut alors reprendre la main. Détails : [`docs/CLAUDE-DESKTOP.md`](../CLAUDE-DESKTOP.md).

> **Pas encore vérifié avec la vraie application.** Le cycle écriture/sauvegarde/restauration a été testé avec un dossier simulé. Le comportement de l'application Windows demande un essai sur une machine équipée.

---

## Windows avec OmniRoute ou CC-Switch

AgentAdapter ne modifie ni `~/.claude/settings.json`, ni `~/.codex/config.toml`, ni les fichiers CC-Switch.

- Une session `claude` normale continue avec OmniRoute/NVIDIA.
- `cc-agent` définit `ANTHROPIC_BASE_URL` et le modèle **uniquement pour son processus enfant**.
- `codex-agent` utilise un `CODEX_HOME` séparé sous `%LOCALAPPDATA%\agentrouter\codex` ; votre profil et votre historique Codex restent intacts.
- Le profil bureau est distinct de celui de CC-Switch ; `desktop off` restaure l'`appliedId` précédent.

Vous pouvez donc cloner le dépôt et travailler dessus avec Claude Code pendant que celui-ci passe par OmniRoute. Séquence exacte : [`docs/WINDOWS.md`](../WINDOWS.md).

---

## Sécurité

- La clé API n'entre jamais dans le dépôt, le profil bureau, la configuration Codex ou les arguments de processus.
- Le pont n'écoute que sur `127.0.0.1` et exige un jeton local aléatoire (`0600`).
- Les requêtes amont utilisent toujours l'identification Claude CLI et `x-app: cli`.
- Les journaux contiennent modèle, statut, jetons et durées — jamais les prompts, les sorties d'outils ou les clés.
- Le profil bureau stocke le **jeton local du pont**, pas la clé AgentRouter.
- Si une clé a été partagée dans un chat, un ticket ou un commit, révoquez-la dans AgentRouter.

Plus : [`SECURITY.md`](../../SECURITY.md).

---

## Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| `401 unauthorized client detected` | Filtre client amont modifié, ou client hors du pont | `agentrouter doctor` ; mettre à jour AgentAdapter |
| `400 Function tools with reasoning_effort are not supported` | Requête passée par le chemin Anthropic | Garder le mode `stable` ; le pont utilise `/v1/responses` |
| Liste de modèles vide dans Claude Desktop | Application pas vraiment redémarrée | Quitter l'icône de barre d'état, rouvrir, vérifier `desktop status` |
| Codex sort en 182 sur Termux | Bac à sable Bubblewrap indisponible sous PRoot | `codex-agent` le désactive ; ne pas passer `-s workspace-write` |
| `Port 8787 is already in use` | Autre pont ou application | `agentrouter serve --port 8788` |
| `claude: not found` | CLI absente | `npm install -g @anthropic-ai/claude-code` |
| Liste vide | La clé n'a aucun modèle OpenAI | Vérifier le groupe de la clé |

Journaux : `~/.config/agentrouter/logs/agentrouter.log`. Commencez toujours par `agentrouter doctor`.

---

## Développement

```bash
node --test
node bin/agentrouter.js doctor --quick
```

Structure :

```
bin/              points d'entrée CLI
src/translate.js  conversion Anthropic ↔ Responses et machine à états SSE
src/server.js     pont HTTP local
src/agent.js      logique commune cc-agent / codex-agent
src/desktop.js    profil Claude Desktop avec sauvegarde
src/doctor.js     diagnostic en direct
test/             18 tests avec un amont simulé
docs/             statut, journal de vérification, guides Windows et Desktop, spec
```

Conception d'origine : [`docs/agentrouter-adapter-spec.md`](../agentrouter-adapter-spec.md). Pour continuer avec Claude Code ou un autre agent : [`AGENTS.md`](../../AGENTS.md).

---

## État et limites

Vérifié sur Android/Termux : authentification, modèles en direct, Claude Code avec outils, Codex avec outils, streaming, menu, jeton local, diagnostic, mécanique du profil bureau, installateur et annulation.

Non vérifié sur matériel : installation et démarrage auto sous Windows, Claude Desktop avec la vraie application, mode raisonnement complet, démarrage systemd sous Linux.

Volontairement absent : traduction du cache de prompt, `/v1/chat/completions`, interface graphique, publication npm, service d'arrière-plan sous Android.

Liste complète : [`docs/STATUS.md`](../STATUS.md).

---

## Licence

MIT. Voir [`LICENSE`](../../LICENSE).
