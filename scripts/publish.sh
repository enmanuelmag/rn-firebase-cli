#!/usr/bin/env bash
set -e

DRY_RUN=false
SKIP_TESTS=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --skip-tests) SKIP_TESTS=true ;;
  esac
done

echo "=== @cardor/rn-firebase-cli publish ==="

# Validate git state
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Working tree is not clean. Commit or stash changes first."
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  echo "ERROR: Must publish from main/master branch (current: $BRANCH)"
  exit 1
fi

# Run tests
if [ "$SKIP_TESTS" = false ]; then
  echo "Running tests..."
  pnpm test
fi

# Build
echo "Building..."
pnpm build

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would publish $TAG to npm"
  echo "[dry-run] Would create git tag $TAG"
  echo "[dry-run] Would create GitHub release $TAG"
  exit 0
fi

# Publish to npm
echo "Publishing $TAG to npm..."
npm publish --access public

# Git tag
git tag "$TAG"
git push origin "$TAG"

# GitHub release
NOTES=$(git log --pretty=format:"- %s" "$(git describe --tags --abbrev=0 HEAD^)"..HEAD 2>/dev/null || git log --pretty=format:"- %s")
gh release create "$TAG" --title "$TAG" --notes "$NOTES"

echo ""
echo "=== Published $TAG ==="
