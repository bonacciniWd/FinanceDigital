#!/usr/bin/env bash
# scripts/release-local.sh
# Build + sign + notarize + publish local (Mac + Win + Linux) da versão atual.
#
# Uso:
#   ./scripts/release-local.sh           # builda tudo e publica no GitHub Release
#   ./scripts/release-local.sh --mac     # apenas macOS
#   ./scripts/release-local.sh --nopub   # builda sem publicar (test)
#
# Requer arquivo .env.electron na raiz com:
#   APPLE_ID=seu@email.com
#   APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
#   APPLE_TEAM_ID=ABCDE12345
#
# E um Developer ID Application instalado no Keychain.

set -euo pipefail

cd "$(dirname "$0")/.."

# ── 1. Carrega env vars ─────────────────────────────────────────
if [ -f .env.electron ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env.electron | xargs)
  echo "✓ Loaded .env.electron"
else
  echo "⚠️  .env.electron não encontrado — notarização será pulada."
fi

# ── 2. GH_TOKEN via gh CLI ──────────────────────────────────────
if command -v gh >/dev/null 2>&1; then
  export GH_TOKEN="$(gh auth token)"
  echo "✓ GH_TOKEN via gh CLI"
else
  echo "❌ gh CLI não encontrado (brew install gh && gh auth login)"
  exit 1
fi

# ── 3. Flags ────────────────────────────────────────────────────
FLAGS=""
PUBLISH="--publish always"
for arg in "$@"; do
  case "$arg" in
    --mac)     FLAGS="--mac" ;;
    --win)     FLAGS="$FLAGS --win" ;;
    --linux)   FLAGS="$FLAGS --linux" ;;
    --all)     FLAGS="--mac --win --linux" ;;
    --nopub)   PUBLISH="" ;;
  esac
done
# default: all three
if [ -z "$FLAGS" ]; then
  FLAGS="--mac --win --linux"
fi

VERSION="$(node -p "require('./package.json').version")"
echo ""
echo "────────────────────────────────────────"
echo "  Release v$VERSION  $FLAGS  $PUBLISH"
echo "────────────────────────────────────────"
echo ""

# ── 4. Vite build + electron-builder ────────────────────────────
npm run build
# shellcheck disable=SC2086
npx electron-builder $FLAGS --config electron-builder.json $PUBLISH

echo ""
echo "✅  Release v$VERSION done."
