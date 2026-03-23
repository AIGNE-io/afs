#!/bin/bash
# Provider directory restructure — move providers into categorized subdirectories
# Uses git mv to preserve history

set -e

cd "$(git rev-parse --show-toplevel)"

echo "=== Provider Directory Restructure ==="

# Helper: git mv only if provider has tracked files
safe_git_mv() {
  local src="$1"
  local dst="$2"
  if [ ! -d "$src" ]; then
    echo "SKIP (not found): $src"
    return
  fi
  local tracked
  tracked=$(git ls-files "$src/" | head -1)
  if [ -z "$tracked" ]; then
    echo "SKIP (no tracked files): $src"
    return
  fi
  echo "Moving: $src -> $dst"
  git mv "$src" "$dst"
}

# Create category directories
mkdir -p providers/core providers/basic providers/platform providers/messaging \
         providers/iot providers/cost providers/ai providers/runtime

# Core (8 + markdown + registry)
for p in memory json toml kv vault workspace session proc markdown registry; do
  safe_git_mv "providers/$p" "providers/core/$p"
done

# Basic (9)
for p in fs local-fs http sandbox ash scheduler rotation index did-space; do
  safe_git_mv "providers/$p" "providers/basic/$p"
done

# Platform (11)
for p in s3 gcs r2 ec2 gce dns cloudflare cf-pages github git sqlite; do
  safe_git_mv "providers/$p" "providers/platform/$p"
done

# Messaging (11)
for p in slack discord telegram x gmail lark dingtalk wecom mattermost matrix did-mailbox; do
  safe_git_mv "providers/$p" "providers/messaging/$p"
done

# IoT (5)
for p in synology homeassistant frigate tesla omada; do
  safe_git_mv "providers/$p" "providers/iot/$p"
done

# Cost (5)
for p in aws-cost gcp-cost cloudflare-cost github-cost cloud-cost; do
  safe_git_mv "providers/$p" "providers/cost/$p"
done

# AI (2)
for p in embedding aignehub; do
  safe_git_mv "providers/$p" "providers/ai/$p"
done

# Runtime (8)
for p in ui ui-wm web-device pages persona ocap mcp mcp-recipe; do
  safe_git_mv "providers/$p" "providers/runtime/$p"
done

echo ""
echo "=== File moves complete ==="

# Check for any remaining providers
echo ""
echo "=== Checking for uncategorized providers ==="
for d in providers/*/; do
  case "$d" in
    providers/core/|providers/basic/|providers/platform/|providers/messaging/|providers/iot/|providers/cost/|providers/ai/|providers/runtime/)
      ;;
    *)
      if [ -f "${d}package.json" ]; then
        echo "WARNING: Uncategorized provider: $d"
      fi
      ;;
  esac
done

echo ""
echo "=== Done ==="
