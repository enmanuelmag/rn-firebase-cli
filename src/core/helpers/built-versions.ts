import { existsSync, readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureDir } from 'fs-extra'

import { STATE_DIR } from './env-state.js'

/**
 * Advisory, non-blocking tracker of "already built" version+platform pairs,
 * stored under the gitignored `.rn-firebase/` state directory. Never
 * performs any git operations — writing to this file is purely local
 * bookkeeping to warn the user that they may be about to rebuild the same
 * version, not a hard gate (see `-s/--skip-build-validation`).
 */
export interface BuiltVersionsState {
  versions: string[]
}

const BUILT_VERSIONS_FILE = 'built-versions.json'

export function getBuiltVersionsPath(cwd: string): string {
  return join(cwd, STATE_DIR, BUILT_VERSIONS_FILE)
}

/** Reads the built-versions state file. Returns an empty list if missing or unreadable. */
export async function readBuiltVersions(cwd: string): Promise<BuiltVersionsState> {
  const statePath = getBuiltVersionsPath(cwd)
  if (!existsSync(statePath)) return { versions: [] }

  try {
    const raw = await readFile(statePath, 'utf8')
    const parsed = JSON.parse(raw) as BuiltVersionsState
    return { versions: Array.isArray(parsed?.versions) ? parsed.versions : [] }
  } catch {
    return { versions: [] }
  }
}

/** Writes the built-versions state file, creating the containing directory if needed. */
export async function writeBuiltVersions(cwd: string, state: BuiltVersionsState): Promise<void> {
  const dir = join(cwd, STATE_DIR)
  await ensureDir(dir)
  await writeFile(join(dir, BUILT_VERSIONS_FILE), JSON.stringify(state, null, 2) + '\n', 'utf8')
}

/** Builds the dedup key stored in `versions`: `"<version>:<platform>"`. */
export function buildVersionKey(version: string, platform: string): string {
  return `${version}:${platform}`
}

/** Returns true if this exact version+platform combination was already recorded as built. */
export function hasBuiltVersion(
  state: BuiltVersionsState,
  version: string,
  platform: string
): boolean {
  return state.versions.includes(buildVersionKey(version, platform))
}

/** Returns a new state with the version+platform key appended (no-op if already present). */
export function addBuiltVersion(
  state: BuiltVersionsState,
  version: string,
  platform: string
): BuiltVersionsState {
  const key = buildVersionKey(version, platform)
  if (state.versions.includes(key)) return state
  return { versions: [...state.versions, key] }
}

/**
 * Resolves the "app version" used for build-dedup purposes, best-effort:
 *   1. app.json -> expo.version
 *   2. package.json -> version
 *   3. undefined (dedup check is skipped gracefully, non-blocking)
 *
 * Never throws — malformed JSON or missing files simply fall through to the
 * next candidate, and ultimately to `undefined`.
 */
export function resolveAppVersion(cwd: string): string | undefined {
  const appJsonPath = join(cwd, 'app.json')
  if (existsSync(appJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(appJsonPath, 'utf8')) as {
        expo?: { version?: string }
      }
      if (typeof parsed.expo?.version === 'string' && parsed.expo.version.length > 0) {
        return parsed.expo.version
      }
    } catch {
      // malformed app.json — fall through to package.json
    }
  }

  const packageJsonPath = join(cwd, 'package.json')
  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string }
      if (typeof parsed.version === 'string' && parsed.version.length > 0) {
        return parsed.version
      }
    } catch {
      // malformed package.json — fall through to undefined
    }
  }

  return undefined
}
