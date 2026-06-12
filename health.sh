#!/usr/bin/env bash
# health.sh — project health check for agent-harness-kit
#
# This script must exit 0 when the project is healthy.
# Agents will run this before making codebase changes.
#
# TODO: implement your project's health checks below.
# Examples:
#   npm test
#   docker compose ps | grep -q "running"
#   psql -c "SELECT 1" > /dev/null 2>&1
#
# Until you implement it, this script intentionally exits 1
# so agents know the environment is not verified.

# type check
pnpm run typecheck
if [ $? -ne 0 ]; then
  echo "Type check failed. Please fix the issues before running health checks."
  exit 1
fi

# build
pnpm run build

if [ $? -ne 0 ]; then
  echo "Build failed. Please fix the issues before running health checks."
  exit 1
fi

# test
pnpm run test
if [ $? -ne 0 ]; then
  echo "Tests failed. Please fix the issues before running health checks."
  exit 1
fi

echo "All health checks passed. The project is healthy."

exit 0
