#!/usr/bin/env bash
# Stand up a second Triplane instance beside the first, so both are live at once.
#
# A git worktree, not a copy: same commit, same engine, same lockfile. The ONLY
# difference between the two instances is TRIPLANE_BUNDLE. That is the white-label
# claim, made checkable rather than asserted.
#
#   npm run instance:docs                     # docs bundle on :3001
#   bash scripts/second-instance.sh <dir> <port> <bundle>
#
# Idempotent — safe to re-run between rehearsals.
set -euo pipefail

DIR=${1:-.instances/docs}
PORT=${2:-3001}
BUNDLE=${3:-triplane-docs}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

TARGET=$(git rev-parse HEAD)

if [ ! -d "$DIR" ]; then
  echo "▲ creating worktree $DIR at $TARGET"
  git worktree add --detach "$DIR" "$TARGET"
else
  # A worktree is pinned to the commit it was created from. Without this it silently
  # serves whatever HEAD was on the day it was made — which turns "one engine, two
  # bundles" into "two different builds", the opposite of what the flip is meant to show.
  echo "▲ updating worktree $DIR to $TARGET"
  git -C "$DIR" checkout --detach --quiet "$TARGET"
fi

cd "$DIR"

# A real install, deliberately: symlinking the primary node_modules would resolve
# @triplane/engine to the other checkout and put a workspace package outside this
# app's project root, which the bundler will not accept. Run every time — npm is a
# no-op when the tree already matches, and a stale instance is worse than a slow start.
echo "▲ syncing dependencies"
npm install --silent

# One copy of the secret on disk, shared by both instances.
if [ -f "$ROOT/apps/web/.env.local" ] && [ ! -e apps/web/.env.local ]; then
  ln -s "$ROOT/apps/web/.env.local" apps/web/.env.local
  echo "▲ linked apps/web/.env.local from the primary checkout"
fi

# TRIPLANE_DOMAIN is not optional here: without it the catalog advertises a placeholder
# origin and any ARD client has to rewrite the endpoint it was told to use.
echo "▲ building '$BUNDLE' for http://localhost:$PORT"
TRIPLANE_BUNDLE="$BUNDLE" TRIPLANE_DOMAIN="http://localhost:$PORT" \
  npx tsx packages/cli/src/build.ts "bundles/$BUNDLE"

echo "▲ starting on :$PORT — the other instance keeps running on :3000"
TRIPLANE_BUNDLE="$BUNDLE" TRIPLANE_DOMAIN="http://localhost:$PORT" \
  npm run dev --workspace apps/web -- -p "$PORT"
