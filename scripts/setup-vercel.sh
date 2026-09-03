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

V="npx --yes vercel@latest"
[ -f .env.vercel ] && set -a && . ./.env.vercel && set +a
[ -n "${VERCEL_TOKEN:-}" ] && V="$V --token $VERCEL_TOKEN"

# name:bundle — the ONLY thing that differs between the four deployments.
PROJECTS=(
  "triplane-meridian:meridian"
  "triplane-docs:triplane-docs"
  "triplane-controls:controls"
  "triplane-dhruva:dhruva"
)

secret() { grep -m1 "^$1=" "$2" 2>/dev/null | cut -d= -f2- | tr -d '\r\n'; }
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
  echo "▲ collecting deployment URLs"
  LIST=""
  for entry in "${PROJECTS[@]}"; do
    name="${entry%%:*}"
    url=$($V project inspect "$name" 2>/dev/null | grep -oE 'https://[a-z0-9.-]+\.vercel\.app' | head -1)
    [ -z "$url" ] && { echo "  ✗ no URL for $name — deploy it first"; exit 1; }
    label=$(TRIPLANE_BUNDLE="${entry##*:}" npx --yes tsx -e 'import c from "./triplane.config"; console.log((c as any).brand.name)' 2>/dev/null | tail -1)
    LIST="${LIST:+$LIST,}${label}=${url}"
    echo "  $name → $url"
  done
  for entry in "${PROJECTS[@]}"; do
    name="${entry%%:*}"
    $V link --project "$name" --yes >/dev/null
    echo "  $name"
    set_env "$name" TRIPLANE_PEERS "$LIST"
    $V deploy --prod >/dev/null &
  done
  wait
  echo "▲ peers set on all four; redeploys running"
  exit 0
fi

for entry in "${PROJECTS[@]}"; do
  name="${entry%%:*}"; bundle="${entry##*:}"
  echo "▲ $name  (bundle: $bundle)"
  $V project add "$name" >/dev/null 2>&1 || echo "    (already exists)"
  $V link --project "$name" --yes >/dev/null

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
