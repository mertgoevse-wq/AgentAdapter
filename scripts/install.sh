#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${AGENTROUTER_INSTALL_DIR:-$HOME/.local/share/agentrouter/app}"
BIN_DIR="$HOME/.local/bin"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  if [ -n "${TERMUX_VERSION:-}" ]; then
    echo "On Termux: pkg install nodejs" >&2
  fi
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is required (found $(node -v))." >&2
  exit 1
fi

echo "Installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR" "$BIN_DIR"
for item in bin src scripts package.json README.md LICENSE docs; do
  if [ -e "$ROOT/$item" ]; then
    rm -rf "$INSTALL_DIR/$item"
    cp -R "$ROOT/$item" "$INSTALL_DIR/$item"
  fi
done

chmod +x "$INSTALL_DIR/bin/agentrouter.js" "$INSTALL_DIR/bin/cc-agent.js" "$INSTALL_DIR/bin/codex-agent.js"
ln -sf "$INSTALL_DIR/bin/agentrouter.js" "$BIN_DIR/agentrouter"
ln -sf "$INSTALL_DIR/bin/cc-agent.js" "$BIN_DIR/cc-agent"
ln -sf "$INSTALL_DIR/bin/codex-agent.js" "$BIN_DIR/codex-agent"

PROFILE_UPDATED=false
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    if ! grep -q 'agent-adapter install' "$HOME/.profile" 2>/dev/null; then
      {
        echo ''
        echo '# >>> agent-adapter install >>>'
        echo 'export PATH="$HOME/.local/bin:$PATH"'
        echo '# <<< agent-adapter install <<<'
      } >> "$HOME/.profile"
      PROFILE_UPDATED=true
      echo "Added $BIN_DIR to PATH in ~/.profile (open a new shell)."
    fi
    ;;
esac

mkdir -p "$HOME/.config/agentrouter"
node -e '
const fs = require("fs");
const path = require("path");
const dir = process.argv[1];
const file = path.join(process.env.HOME, ".config", "agentrouter", "install.json");
fs.writeFileSync(file, JSON.stringify({
  version: 1,
  installDir: dir,
  binLinks: ["agentrouter", "cc-agent", "codex-agent"].map((name) => path.join(process.env.HOME, ".local", "bin", name)),
  profileBlock: process.argv[2] === "true",
  installedAt: new Date().toISOString()
}, null, 2) + "\n", { mode: 0o600 });
' "$INSTALL_DIR" "$PROFILE_UPDATED"

echo
echo "Installed. Run:"
echo "  agentrouter login"
echo "  cc-agent"
echo "  codex-agent"
echo
echo "Claude Desktop is available on Linux only if the app is installed."
echo "Run 'agentrouter desktop on' after starting the app once."
