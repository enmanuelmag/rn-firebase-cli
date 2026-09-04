import { existsSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { renderHeader, runWithRepaint } from '../helpers/build-run.js'

/**
 * iOS local submit — uploads a freshly built `.ipa` to App Store Connect via
 * `xcrun altool` (no EAS). Layered so every decision is pure and unit-
 * testable: credential/arg builders, pre-checks + setup-message renderers,
 * and a single spawn-performing executor at the bottom.
 */

/**
 * Resolved App Store Connect credentials. `api-key` is the preferred kind
 * (a team `.p8` key); `apple-id` is the app-specific-password fallback.
 */
export type IosCredentials =
  | { kind: 'api-key'; p8Path: string; apiIssuerId: string; apiKeyId: string }
  | { kind: 'apple-id'; appleId: string; appPassword: string }

/**
 * Pure directory search for an ASC team key: returns the first
 * `AuthKey_<keyId>.p8` found in `searchDirs` (in order), or `undefined`.
 * Kept separate from `resolveIosCredentials` so tests can point it at
 * controlled directories without env mutation.
 */
export function findP8Key(keyId: string, searchDirs: string[]): string | undefined {
  const filename = `AuthKey_${keyId}.p8`
  for (const dir of searchDirs) {
    const candidate = join(dir, filename)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Pure credential resolver — takes an env object (NOT `process.env`
 * directly, so dotenv's process-wide mutations never leak into the
 * decision). Resolution order:
 *
 * 1. **ASC API key**: `ASC_API_KEY_ID` + `ASC_API_ISSUER_ID` set AND
 *    `AuthKey_<ASC_API_KEY_ID>.p8` found in one of these five distinct
 *    locations (in order, first match wins):
 *    1. `./private_keys` (cwd)
 *    2. `$HOME/private_keys`
 *    3. `$HOME/.private_keys` (a hidden dir — fastlane's default ASC key location)
 *    4. `$HOME/.appstoreconnect/private_keys`
 *    5. `$API_PRIVATE_KEYS_DIR` (if set)
 *    (duplicates are deduped, e.g. when `API_PRIVATE_KEYS_DIR` points at
 *    an already-listed dir.)
 * 2. **App-specific password**: `ASC_APPLE_ID` + `ASC_APP_PASSWORD` set.
 * 3. Otherwise `undefined`.
 */
export function resolveIosCredentials(env: NodeJS.ProcessEnv): IosCredentials | undefined {
  const apiKeyId = env.ASC_API_KEY_ID
  const apiIssuerId = env.ASC_API_ISSUER_ID

  if (apiKeyId && apiIssuerId) {
    const home = env.HOME
    const searchDirs = [
      join(process.cwd(), 'private_keys'),
      ...(home
        ? [
            join(home, 'private_keys'),
            join(home, '.private_keys'),
            join(home, '.appstoreconnect', 'private_keys'),
          ]
        : []),
      ...(env.API_PRIVATE_KEYS_DIR ? [env.API_PRIVATE_KEYS_DIR] : []),
    ]
    // Dedupe — e.g. API_PRIVATE_KEYS_DIR may point at an already-listed dir.
    const p8Path = findP8Key(apiKeyId, [...new Set(searchDirs)])
    if (p8Path) {
      return { kind: 'api-key', p8Path, apiIssuerId, apiKeyId }
    }
  }

  const appleId = env.ASC_APPLE_ID
  const appPassword = env.ASC_APP_PASSWORD
  if (appleId && appPassword) {
    return { kind: 'apple-id', appleId, appPassword }
  }

  return undefined
}

/**
 * Pure command-array builder for `xcrun altool --upload-app`. No spawn, no
 * process side effects — safe to unit test directly.
 */
export function buildAltoolUploadArgs(artifact: string, creds: IosCredentials): string[] {
  const base = ['altool', '--upload-app', '-f', artifact, '-t', 'ios']
  if (creds.kind === 'api-key') {
    return [...base, '--apiKey', creds.apiKeyId, '--apiIssuer', creds.apiIssuerId]
  }
  return [...base, '-u', creds.appleId, '-p', creds.appPassword]
}

/**
 * Pure command-array builder for the optional `xcrun altool --validate-app`
 * pre-flight. Available but not wired to a CLI flag in this task.
 */
export function buildAltoolValidateArgs(artifact: string): string[] {
  return ['altool', '--validate-app', '-f', artifact]
}

/** Pure platform check — `altool` only exists on macOS. */
export function isMacOS(platform: NodeJS.Platform): boolean {
  return platform === 'darwin'
}

/**
 * Pure PATH search: returns the path to the first `xcrun` executable found
 * in the given directory list, or `undefined`. Pure given the dir list —
 * the thin `xcrunOnPath()` wrapper is the only function that touches
 * `process.env`.
 */
export function findXcrunInPath(pathDirs: string[]): string | undefined {
  for (const dir of pathDirs) {
    const candidate = join(dir, 'xcrun')
    if (!existsSync(candidate)) continue
    try {
      if (!statSync(candidate).isFile()) continue
    } catch {
      continue
    }
    return candidate
  }
  return undefined
}

/** Thin process-touching wrapper: is `xcrun` resolvable on the current PATH? */
export function xcrunOnPath(): boolean {
  const pathDirs = (process.env.PATH ?? '').split(delimiter).filter((dir) => dir !== '')
  return findXcrunInPath(pathDirs) !== undefined
}

/** Which pre-checks failed — drives the setup report + the structured error. */
export interface IosPrecheckIssues {
  nonMacOs?: boolean
  missingXcrun?: boolean
  missingCredentials?: boolean
}

/**
 * Pure English setup report for the macOS pre-check failures. Renders only
 * the sections relevant to the given issues — no I/O.
 */
export function renderIosSetupReport(issues: IosPrecheckIssues): string {
  const lines: string[] = [
    'Local iOS submit could not start — pre-checks failed and no upload was attempted.',
    '',
  ]

  if (issues.nonMacOs) {
    lines.push(renderNonMacOsMessage(), '')
  }

  if (issues.missingXcrun) {
    lines.push(
      'xcrun was not found on PATH:',
      '  - Install Xcode (or the Xcode Command Line Tools) so that `xcrun` is available.',
      ''
    )
  }

  if (issues.missingCredentials) {
    lines.push(
      'No App Store Connect credentials could be resolved. To set up an ASC API key:',
      '  1. Open App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → Generate API Key.',
      '  2. Download the .p8 key file. WARNING: this is a one-time download — Apple shows the key only once; if you lose it, you must generate a new key.',
      '  3. Place the file (named AuthKey_<KEY_ID>.p8) in one of these directories:',
      '       - ./private_keys (current directory)',
      '       - $HOME/private_keys',
      '       - $HOME/.private_keys',
      '       - $HOME/.appstoreconnect/private_keys',
      '       - $API_PRIVATE_KEYS_DIR (if set)',
      '  4. Export the environment variables:',
      '       ASC_API_KEY_ID=<your key id>',
      '       ASC_API_ISSUER_ID=<your issuer id>',
      '       (optionally API_PRIVATE_KEYS_DIR=<dir> if the key lives somewhere else)',
      '',
      'Alternative — app-specific password:',
      '  1. Create an app-specific password at https://appleid.apple.com (Sign-In and Security → App-Specific Passwords).',
      '  2. Export ASC_APPLE_ID=<your Apple ID email> and ASC_APP_PASSWORD=<the app-specific password>.'
    )
  }

  return lines.join('\n')
}

/** Pure English message for the non-macOS case. */
export function renderNonMacOsMessage(): string {
  return 'Local iOS submit requires macOS with Xcode — altool is macOS-only and cannot run on this platform.'
}

/**
 * Structured pre-check failure for the iOS local submit. Carries a stable
 * `code` + the typed `issues` that failed, so callers and tests can
 * distinguish it from a real upload failure without brittle string matching.
 * The `message` is the full English setup report (printed by build.ts's
 * catch, which then exits non-zero).
 */
export class IosSubmitPrecheckError extends Error {
  readonly code = 'IOS_SUBMIT_PRECHECK_FAILED'
  readonly issues: IosPrecheckIssues

  constructor(message: string, issues: IosPrecheckIssues) {
    super(message)
    this.name = 'IosSubmitPrecheckError'
    this.issues = issues
  }
}

/**
 * Structured spawn failure for the iOS local submit — mirrors how the EAS
 * submit path surfaces a non-zero exit (the failure tail is already printed
 * by runWithRepaint; this error carries the exit code + log path so the
 * caller can exit non-zero without an unhandled rejection).
 */
export class IosSubmitSpawnError extends Error {
  readonly code = 'IOS_SUBMIT_SPAWN_FAILED'
  readonly exitCode: number
  readonly logFilePath: string

  constructor(params: { exitCode: number; logFilePath: string; artifactPath?: string }) {
    const fallback = params.artifactPath
      ? `\n\n  Retry manually with: rn-firebase submit --path ${params.artifactPath} --platform ios`
      : ''
    super(
      `xcrun altool upload failed with exit code ${params.exitCode} — full log: ${params.logFilePath}.${fallback}`
    )
    this.name = 'IosSubmitSpawnError'
    this.exitCode = params.exitCode
    this.logFilePath = params.logFilePath
  }
}

/**
 * Pre-checks for local iOS submit. Validates macOS, `xcrun` on PATH, and
 * resolvable ASC credentials. Throws an `IosSubmitPrecheckError` (with the
 * English setup report) if any check fails — no spawn occurs.
 *
 * Exported so callers (e.g. `build.ts`) can run these checks *before* the
 * build step and fail fast without wasting time.
 */
export function checkIosSubmitPreconditions(platform: NodeJS.Platform): IosPrecheckIssues {
  const issues: IosPrecheckIssues = {}

  if (!isMacOS(platform)) {
    issues.nonMacOs = true
  }

  const xcrunAvailable = xcrunOnPath()
  const creds = resolveIosCredentials(process.env)

  if (!xcrunAvailable) issues.missingXcrun = true
  if (!creds) issues.missingCredentials = true

  if (Object.keys(issues).length > 0) {
    throw new IosSubmitPrecheckError(renderIosSetupReport(issues), issues)
  }

  return issues
}

/**
 * iOS local submit executor. Pre-checks (macOS + `xcrun` on PATH +
 * resolvable credentials) run first; if any fail, a structured
 * `IosSubmitPrecheckError` with the English setup report is thrown WITHOUT
 * spawning. Otherwise the upload is spawned through the generic
 * `runWithRepaint` runner (`binary: 'xcrun'`), and a non-zero exit throws
 * `IosSubmitSpawnError`.
 */
export async function runLocalIosSubmit(params: {
  artifactPath: string
  profile: string
}): Promise<void> {
  checkIosSubmitPreconditions(process.platform)

  const result = await runWithRepaint({
    args: buildAltoolUploadArgs(params.artifactPath, resolveIosCredentials(process.env)!),
    binary: 'xcrun',
    header: renderHeader({ command: 'submit', platform: 'ios', profile: params.profile }),
    logPrefix: 'rn-firebase-ios-submit',
  })

  if (result.exitCode !== 0) {
    throw new IosSubmitSpawnError({
      exitCode: result.exitCode,
      logFilePath: result.logFilePath,
      artifactPath: params.artifactPath,
    })
  }
}
