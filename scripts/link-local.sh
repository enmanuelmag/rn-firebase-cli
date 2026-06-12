#!/usr/bin/env bash
set -e

echo "Building..."
pnpm build

echo "Linking globally..."
pnpm link --global

echo ""
echo "Done! You can now run: rn-firebase --help"
