#!/usr/bin/env bash
# Create the four Vercel projects, set their environment, connect the repo, deploy.
#
# Requires authentication first — either `vercel login` (credentials are cached), or a
# token in .env.vercel (gitignored). Run from the repo root:
#
#   bash scripts/setup-vercel.sh            # create + configure + deploy
#   bash scripts/setup-vercel.sh peers      # pass two: backfill TRIPLANE_PEERS
#
# Safe to re-run: existing projects and env vars are updated, not duplicated.
set -euo pipefail
cd "$(dirname "$0")/.."

# The CLI reads VERCEL_TOKEN from the environment. Never pass it as --token: npm echoes
# the command it runs, which prints the token in plaintext into any captured log.
V="npx --yes vercel@latest"
[ -f .env.vercel ] && set -a && . ./.env.vercel && set +a
if [ -z "${VERCEL_TOKEN:-}" ] && ! $V whoami >/dev/null 2>&1; then
  echo "✗ Not authenticated. Put VERCEL_TOKEN in .env.vercel, or run \`npx vercel login\`."
  exit 1
fi

# name:bundle — the ONLY thing that differs between the four deployments.
PROJECTS=(
  "triplane-meridian:meridian"
  "triplane-docs:triplane-docs"
  "triplane-controls:controls"
  "triplane-dhruva:dhruva"
)

secret() { grep -m1 "^$1=" "$2" 2>/dev/null | cut -d= -f2- | tr -d '\r\n'; }

API="https://api.vercel.com"
TEAM=$(curl -s -H "Authorization: Bearer ${VERCEL_TOKEN:-}" "$API/v2/teams" \
  | python3 -c "import sys,json;t=json.load(sys.stdin).get('teams',[]);print(t[0]['id'] if t else '')" 2>/dev/null || true)

# Two project defaults have to be turned off, and neither is reachable from the CLI:
#
#  - Preview/production comments inject the Vercel Toolbar into the HTML, which is
#    incompatible with immutable static uploads. The deploy fails outright with
#    IMMUTABLE_STATIC_PATCH_PREVIEW_COMMENTS, and the CLI reports only "Unexpected error".
#  - Deployment protection puts an SSO wall in front of new projects, so every request
#    302s to a login page. A public demo cannot be behind it.
settings() {
  curl -s -X PATCH -H "Authorization: Bearer ${VERCEL_TOKEN:-}" -H "content-type: application/json" \
    "$API/v9/projects/$1${TEAM:+?teamId=$TEAM}" \
    -d '{"enablePreviewFeedback":false,"enableProductionFeedback":false,"ssoProtection":null}' >/dev/null
  echo "    comments off, deployment protection off"
}
ANTHROPIC=$(secret ANTHROPIC_API_KEY apps/web/.env.local)
GH_TOKEN=${GITHUB_PAT:-}

if [ -z "$ANTHROPIC" ]; then echo "✗ ANTHROPIC_API_KEY missing from apps/web/.env.local"; exit 1; fi
if [ -z "$GH_TOKEN" ]; then
  echo "✗ GITHUB_PAT missing from .env.vercel."
  echo "  Use a personal access token with 'repo' scope — NOT \`gh auth token\`, which is a"
  echo "  short-lived OAuth token and will expire mid-demo."
  exit 1
fi

# `vercel env add` reads the value from stdin, so nothing lands in the shell history.
set_env() {  # project key value
  $V env rm "$2" production --yes >/dev/null 2>&1 || true
  printf '%s' "$3" | $V env add "$2" production >/dev/null
  echo "    $2"
}

if [ "${1:-create}" = "peers" ]; then
  # Pass two. Peers name the OTHER deployments, so they cannot be known until all four
  # exist — this reads the live URLs back and writes them to every project.
  # `vercel project inspect` does not print the production alias, so read it from the API.
  # targets.production.alias holds the stable <project>.vercel.app name; the per-deployment
  # url changes on every build and would go stale the moment anything redeploys.
  echo "▲ collecting deployment URLs"
  LIST=""
  for entry in "${PROJECTS[@]}"; do
    name="${entry%%:*}"
    url=$(curl -s -H "Authorization: Bearer ${VERCEL_TOKEN:-}" \
      "$API/v9/projects/$name${TEAM:+?teamId=$TEAM}" | python3 -c "
import sys, json
t = ((json.load(sys.stdin).get('targets') or {}).get('production') or {})
a = t.get('alias') or []
print('https://' + min(a, key=len) if a else (('https://' + t['url']) if t.get('url') else ''))" 2>/dev/null || true)
    [ -z "$url" ] && { echo "  ✗ no URL for $name — deploy it first"; exit 1; }
    label=$(TRIPLANE_BUNDLE="${entry##*:}" npx --yes tsx -e 'import c from "./triplane.config"; console.log((c as any).brand.name)' 2>/dev/null | tail -1)
    LIST="${LIST:+$LIST,}${label}=${url}"
    echo "  $name → $label ${url}"
  done
  # Sequential on purpose: `vercel deploy` reads .vercel/project.json when it starts, and
  # the next `link` overwrites that file. Backgrounding these deploys races the link and
  # can ship one project's build to another.
  for entry in "${PROJECTS[@]}"; do
    name="${entry%%:*}"
    $V link --project "$name" --yes >/dev/null
    echo "  $name"
    set_env "$name" TRIPLANE_PEERS "$LIST"
    $V deploy --prod >/dev/null
  done
  echo "▲ peers set on all four; all four redeployed"
  exit 0
fi

for entry in "${PROJECTS[@]}"; do
  name="${entry%%:*}"; bundle="${entry##*:}"
  echo "▲ $name  (bundle: $bundle)"
  $V project add "$name" >/dev/null 2>&1 || echo "    (already exists)"
  $V link --project "$name" --yes >/dev/null
  settings "$name"

  set_env "$name" TRIPLANE_BUNDLE "$bundle"
  set_env "$name" ANTHROPIC_API_KEY "$ANTHROPIC"
  set_env "$name" GITHUB_TOKEN "$GH_TOKEN"
  set_env "$name" TRIPLANE_REPO "acumind/triplane"

  # Connect the repo so a merge redeploys — that is what makes approval the deploy.
  $V git connect --yes >/dev/null 2>&1 || echo "    (git already connected)"
  $V deploy --prod
done

echo
echo "▲ all four deployed. Now run: bash scripts/setup-vercel.sh peers"
