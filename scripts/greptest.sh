#!/usr/bin/env bash
# The white-label proof: the engine and the ARD client must contain zero bundle-specific
# references. Add a term here whenever a bundle introduces vocabulary that must not leak.
#
# Scope note: code and shipped manifests (*.ts, *.json), not *.md. A README naming one demo
# deployment as an example is documentation; a manifest naming it would ship a Triplane-
# specific default in a client that is supposed to work against anyone's catalog.
set -e
PATTERN='meridian|weekly[_ .-]?active|\bwau\b|churn[_ .-]?rate|northwind|access[_ .-]?review|revenue[_ .-]?cutoff|dhruva|mg[_ .-]?750|ic[_ .-]?1800'
HITS=$(grep -rinE --include='*.ts' --include='*.json' --include='*.mjs' "$PATTERN" packages/ plugins/ || true)
if [ -n "$HITS" ]; then echo "GREPTEST FAIL — engine or ARD client references bundle content:"; echo "$HITS"; exit 1; fi
echo "GREPTEST PASS — engine and ARD client are bundle-agnostic."
