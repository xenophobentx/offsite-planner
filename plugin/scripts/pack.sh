#!/usr/bin/env bash
# Builds an upload-ready plugin zip for Cowork (Plug-ins > Upload) without wiqd provisioning.
# Reads env/.env.dev, fills every ${{NAME}} placeholder in manifest.json, and creates TEAMS_APP_ID once.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=env/.env.dev
[ -f "$ENV_FILE" ] || cp env/.env.dev.sample "$ENV_FILE"
if ! grep -qE '^TEAMS_APP_ID=[0-9a-f-]{36}$' "$ENV_FILE"; then
  id=$(uuidgen | tr 'A-Z' 'a-z')
  sed -i.bak "s/^TEAMS_APP_ID=.*/TEAMS_APP_ID=$id/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
fi
set -a; source "$ENV_FILE"; set +a
: "${MCP_SERVER_URL:?Set MCP_SERVER_URL in env/.env.dev (the azd output SERVICE_MCP_ENDPOINT)}"
export MCP_SERVER_DOMAIN=$(echo "$MCP_SERVER_URL" | sed -E 's#^https?://([^/:]+).*#\1#')
out=appPackage/build
stage=$(mktemp -d)
cp -R appPackage/color.png appPackage/outline.png appPackage/skills appPackage/tools "$stage/"
python3 - appPackage/manifest.json "$stage/manifest.json" <<'PY'
import os, re, sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src).read()
text = re.sub(r"\$\{\{(\w+)\}\}", lambda m: os.environ.get(m.group(1), m.group(0)), text)
if "${{" in text:
    sys.exit("Unresolved placeholder in manifest: " + re.search(r"\$\{\{\w+\}\}", text).group(0))
open(dst, "w").write(text)
PY
mkdir -p "$out"
rm -f "$out/offsite-planner.zip"
(cd "$stage" && zip -qr - .) > "$out/offsite-planner.zip"
rm -rf "$stage"
echo "$out/offsite-planner.zip (app id $TEAMS_APP_ID)"
