#!/usr/bin/env bash
# One-shot, idempotent Cloudflare deploy for SENTINEL (Pages + cron Worker + D1). Run from anywhere:
#   bash scripts/deploy.sh
# The passcode is generated into ~/cyber-monitor-passcode.txt (chmod 600) if it doesn't exist, and is never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d functions ] || { echo "functions/ missing - refusing to deploy an ungated site"; exit 1; }
W="npx -y wrangler@4"
PROJECT=sentinel-cyber-monitor; DB=sentinel-store; PASS=~/cyber-monitor-passcode.txt

$W whoami >/dev/null
ID=$($W d1 list --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).find(x=>x.name==='$DB');process.stdout.write(r?r.uuid:'')})")
if [ -z "$ID" ]; then
  $W d1 create "$DB" >/dev/null
  ID=$($W d1 list --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{process.stdout.write(JSON.parse(s).find(x=>x.name==='$DB').uuid)})")
  NEW_DB=1
fi
echo "D1 $DB = $ID"
sed -i.bak "s/database_id = \".*\"/database_id = \"$ID\"/" wrangler.toml worker/wrangler.toml && rm -f wrangler.toml.bak worker/wrangler.toml.bak
$W d1 execute "$DB" --remote --file migrations/0001_init.sql -y >/dev/null
if [ "${NEW_DB:-0}" = 1 ] && [ -f data/store/nvd-backfill.json ]; then
  node scripts/d1-seed-sql.mjs nvd-backfill data/store/nvd-backfill.json > /tmp/sentinel-seed.sql
  $W d1 execute "$DB" --remote --file /tmp/sentinel-seed.sql -y >/dev/null && rm -f /tmp/sentinel-seed.sql && echo "seeded NVD backfill"
fi

$W pages project list 2>/dev/null | grep -q "$PROJECT" || $W pages project create "$PROJECT" --production-branch main
if [ ! -s "$PASS" ]; then (umask 077; openssl rand -base64 24 | tr -d '/+=\n' > "$PASS"); fi
chmod 600 "$PASS"
$W pages secret put SITE_PASSCODE --project-name "$PROJECT" < "$PASS" >/dev/null && echo "SITE_PASSCODE set (value not shown)"

npm install --no-audit --no-fund >/dev/null
npm run build >/dev/null
$W pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
(cd worker && $W deploy)
