#!/usr/bin/env bash
# The white-label proof: the engine must contain zero bundle-specific references.
# Add a term here whenever a bundle introduces vocabulary that must not leak into packages/.
set -e
PATTERN='meridian|weekly[_ .-]?active|\bwau\b|churn[_ .-]?rate|northwind|access[_ .-]?review|revenue[_ .-]?cutoff|dhruva|mg[_ .-]?750|ic[_ .-]?1800'
HITS=$(grep -rinE --include='*.ts' "$PATTERN" packages/ || true)
if [ -n "$HITS" ]; then echo "GREPTEST FAIL — engine references bundle content:"; echo "$HITS"; exit 1; fi
echo "GREPTEST PASS — engine is bundle-agnostic."
