#!/usr/bin/env bash
# Determines which packages have staged changes and runs check-types on them.
# Used by pre-commit hook to catch type errors before commit.

set -euo pipefail

# Get staged files (relative paths)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=d)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Collect unique package directories from staged files
PACKAGES=""

for file in $STAGED_FILES; do
  dir=""
  case "$file" in
    packages/*/*)      dir=$(echo "$file" | cut -d/ -f1-2) ;;
    providers/*/*/*)   dir=$(echo "$file" | cut -d/ -f1-3) ;;
    conformance/*)     dir="conformance" ;;
    integration-tests/*) dir="integration-tests" ;;
  esac

  if [ -n "$dir" ] && [ -f "$dir/package.json" ]; then
    # Deduplicate
    case " $PACKAGES " in
      *" $dir "*) ;;
      *) PACKAGES="$PACKAGES $dir" ;;
    esac
  fi
done

PACKAGES=$(echo "$PACKAGES" | xargs)  # trim

if [ -z "$PACKAGES" ]; then
  exit 0
fi

# Build turbo filter args
FILTERS=""
for pkg in $PACKAGES; do
  FILTERS="$FILTERS --filter=./$pkg"
done

echo "check-types: $PACKAGES"
pnpm $FILTERS run check-types
