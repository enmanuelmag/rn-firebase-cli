import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'
import { ensureDir } from 'fs-extra'

/**
 * Per-platform sha256 hashes of the last Firebase config file that was
 * synced/cleaned for the active environment. Used by `rn-firebase sync
 * --clean-if-changed` to detect when the underlying source config file
 * changed since the last run, so the native ios/ or android/ folder can be
 * removed to force a clean `expo prebuild` (Expo only copies
 * `googleServicesFile` into the native project during prebuild, not on
 * every `run:*`).
 */
export interface EnvState {
  android?: string
  ios?: string
}

export const STATE_DIR = '.rn-firebase'
const STATE_FILE = 'env-state.json'
const GITIGNORE_ENTRY = `${STATE_DIR}/`

export function getEnvStatePath(cwd: string): string {
  return join(cwd, STATE_DIR, STATE_FILE)
}

/** sha256 hex digest of a file's contents. */
export function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Reads the gitignored env-state file. Returns an empty state if missing or unreadable. */
export async function readEnvState(cwd: string): Promise<EnvState> {
  const statePath = getEnvStatePath(cwd)
  if (!existsSync(statePath)) return {}

  try {
    const raw = await readFile(statePath, 'utf8')
    const parsed = JSON.parse(raw) as EnvState
    return parsed ?? {}
  } catch {
    return {}
  }
}

/** Writes the env-state file, creating the containing directory if needed. */
export async function writeEnvState(cwd: string, state: EnvState): Promise<void> {
  const dir = join(cwd, STATE_DIR)
  await ensureDir(dir)
  await writeFile(join(dir, STATE_FILE), JSON.stringify(state, null, 2) + '\n', 'utf8')
}

/**
 * Ensures the local, gitignored `.rn-firebase/` state directory is added to
 * `.gitignore`. Mirrors `ExpoMaterializer.updateGitignore`'s append/dedupe
 * logic. Best-effort — callers should treat failures as non-fatal.
 */
export async function ensureStateGitignored(cwd: string): Promise<void> {
  const gitignorePath = join(cwd, '.gitignore')

  let current = ''
  if (existsSync(gitignorePath)) {
    current = await readFile(gitignorePath, 'utf-8')
  }

  if (current.split('\n').some((line) => line.trim() === GITIGNORE_ENTRY)) {
    return
  }

  const updated = current.endsWith('\n')
    ? current + GITIGNORE_ENTRY + '\n'
    : current + (current.length > 0 ? '\n' : '') + GITIGNORE_ENTRY + '\n'

  await writeFile(gitignorePath, updated)
  console.log(chalk.green(`  ✔ Updated: .gitignore (added ${GITIGNORE_ENTRY})`))
}
