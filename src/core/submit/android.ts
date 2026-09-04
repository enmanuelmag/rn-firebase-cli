import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'

import { loadConfig } from '../config/load.js'
import { detectPackageName, detectPackageNameFromAppJson } from '../detector/bundle-ids.js'
import {
  commitEdit,
  type FetchFn,
  getPlayAccessToken,
  insertEdit,
  PlayApiError,
  resolveServiceAccountJson,
  type ServiceAccountJson,
  updateTrack,
  uploadBundleResumable,
} from './play-api.js'

import type { RNFConfig } from '../../types.js'

/**
 * Android local submit — uploads a freshly built `.aab` to Google Play via
 * the Google Play Developer API (androidpublisher v3), directly from Node
 * (no external CLI, no EAS). Layered so every decision is pure and
 * unit-testable: credential/packageName resolvers + setup-message renderers,
 * and a single network-performing executor at the bottom.
 */

/** Default Google Play track when `GOOGLE_PLAY_TRACK` is not set. */
export const DEFAULT_GOOGLE_PLAY_TRACK = 'internal'

/** Which pre-checks failed — drives the setup report + the structured error. */
export interface AndroidPrecheckIssues {
  missingCredentials?: boolean
  invalidCredentials?: boolean
  missingPackageName?: boolean
}

/**
 * Discriminated result of the service-account credential pre-check. No I/O
 * beyond the (injected) file read for the path case.
 */
export type ServiceAccountCredentialCheck =
  | { ok: true; serviceAccount: ServiceAccountJson }
  | { ok: false; reason: 'missing' }
  | { ok: false; reason: 'invalid'; detail: string }

/**
 * Pure credential pre-check for `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Returns a
 * discriminated result so the executor can set the right issue flag without
 * re-parsing. `raw` is either a path to a service-account JSON file or the
 * inline JSON itself (see `resolveServiceAccountJson`).
 */
export function checkServiceAccountCredential(
  raw: string | undefined,
  readFileSyncFn?: (path: string) => string
): ServiceAccountCredentialCheck {
  if (raw === undefined || raw.trim() === '') {
    return { ok: false, reason: 'missing' }
  }
  try {
    const serviceAccount = resolveServiceAccountJson(raw, readFileSyncFn)
    return { ok: true, serviceAccount }
  } catch (err) {
    return { ok: false, reason: 'invalid', detail: (err as Error).message }
  }
}

/**
 * Pure packageName resolver. Resolution order:
 * 1. rn-firebase.config's env matching `appEnv` → `env.android.packageName`
 * 2. `android/app/build.gradle` applicationId (`gradlePackageName`)
 * 3. app.json `expo.android.package` (`appJsonPackageName`)
 */
export function resolveAndroidPackageName(params: {
  config: RNFConfig | null
  appEnv: string | undefined
  gradlePackageName: string | undefined
  appJsonPackageName: string | undefined
}): string | undefined {
  const { config, appEnv, gradlePackageName, appJsonPackageName } = params
  if (config && appEnv) {
    const env = config.envs.find((e) => e.name === appEnv)
    if (env?.android?.packageName) return env.android.packageName
  }
  if (gradlePackageName) return gradlePackageName
  if (appJsonPackageName) return appJsonPackageName
  return undefined
}

/** Pure track selector — `GOOGLE_PLAY_TRACK` env override, default 'internal'. */
export function resolveGooglePlayTrack(env: NodeJS.ProcessEnv): string {
  const track = env.GOOGLE_PLAY_TRACK
  if (track && track.trim() !== '') return track.trim()
  return DEFAULT_GOOGLE_PLAY_TRACK
}

/**
 * Pure English setup report for the Android pre-check failures. Renders only
 * the sections relevant to the given issues — no I/O.
 */
export function renderAndroidSetupReport(issues: AndroidPrecheckIssues): string {
  const lines: string[] = [
    'Local Android submit could not start — pre-checks failed and no upload was attempted.',
    '',
  ]

  if (issues.missingCredentials || issues.invalidCredentials) {
    lines.push(
      'No valid Google Play service account could be resolved.',
      'To set up local Android submit:',
      '  1. In Google Cloud Console, enable the "Google Play Android Developer API" (androidpublisher.googleapis.com) for your project.',
      '  2. Create a service account (IAM → Service accounts) and download a JSON key for it (Keys → Add key → Create new key → JSON).',
      '  3. In Play Console → Users and permissions, invite the service account\'s email and grant it app-level access (e.g. "Release to production").',
      '  4. Export the key — it may be a path to the JSON file OR the inline JSON itself:',
      '       GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=/path/to/service-account.json',
      '       (or) GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=\'{"type":"service_account","client_email":"...","private_key":"..."}\'',
      '  The key is never committed; it is read at runtime from the environment (a loaded .env.<env> works too).'
    )
  }

  if (issues.invalidCredentials) {
    lines.push(
      '',
      'The GOOGLE_PLAY_SERVICE_ACCOUNT_JSON value could not be parsed as a valid service account.',
      'It must be a path to a service account JSON file, or the inline JSON, and must include "client_email" and "private_key" (and "type": "service_account").'
    )
  }

  if (issues.missingPackageName) {
    lines.push(
      '',
      'The Android package name (applicationId) could not be resolved.',
      'It is resolved from, in order:',
      '  1. rn-firebase.config env matching APP_ENV → android.packageName',
      '  2. android/app/build.gradle "applicationId"',
      '  3. app.json "expo.android.package"',
      'Make sure one of these is present.'
    )
  }

  return lines.join('\n')
}

/**
 * Structured pre-check failure for the Android local submit. Carries a stable
 * `code` + the typed `issues` that failed, so callers and tests can
 * distinguish it from a real upload failure without brittle string matching.
 * The `message` is the full English setup report (printed by build.ts's
 * catch, which then exits non-zero).
 */
export class AndroidSubmitPrecheckError extends Error {
  readonly code = 'ANDROID_SUBMIT_PRECHECK_FAILED'
  readonly issues: AndroidPrecheckIssues

  constructor(message: string, issues: AndroidPrecheckIssues) {
    super(message)
    this.name = 'AndroidSubmitPrecheckError'
    this.issues = issues
  }
}

/**
 * Structured API failure for the Android local submit — wraps a
 * `PlayApiError` (a non-2xx from the Google Play Developer API) so the
 * caller can exit non-zero without an unhandled rejection.
 */
export class AndroidSubmitApiError extends Error {
  readonly code = 'ANDROID_SUBMIT_API_FAILED'
  readonly status?: number
  readonly url?: string

  constructor(message: string, cause?: PlayApiError, artifactPath?: string) {
    const fallback = artifactPath
      ? `\n\n  Retry manually with: rn-firebase submit --path ${artifactPath} --platform android`
      : ''
    super(`${message}.${fallback}`)
    this.name = 'AndroidSubmitApiError'
    if (cause) {
      this.status = cause.status
      this.url = cause.url
    }
  }
}

export interface RunLocalAndroidSubmitParams {
  artifactPath: string
  profile: string
  /** Injected transport (default: global fetch). */
  fetchFn?: FetchFn
  /** Pre-fetched access token; when provided, skips JWT token acquisition. */
  accessToken?: string
}

/**
 * Pre-checks for local Android submit. Validates service account credentials
 * and package name resolution. Throws an `AndroidSubmitPrecheckError` (with
 * the English setup report) if any check fails — no network call occurs.
 *
 * Exported so callers (e.g. `build.ts`) can run these checks *before* the
 * build step and fail fast without wasting time.
 *
 * `resolvedPackageName` is pre-resolved by the caller (build.ts) to avoid
 * duplicating async work — this function only checks the already-resolved
 * value.
 */
export function checkAndroidSubmitPreconditions(
  rawCred: string | undefined,
  resolvedPackageName: string | undefined,
  readFileSyncFn?: (path: string) => string
): AndroidPrecheckIssues {
  const issues: AndroidPrecheckIssues = {}

  const credCheck = checkServiceAccountCredential(rawCred, readFileSyncFn)
  if (!credCheck.ok) {
    if (credCheck.reason === 'missing') issues.missingCredentials = true
    else issues.invalidCredentials = true
  }

  if (!resolvedPackageName) issues.missingPackageName = true

  if (Object.keys(issues).length > 0) {
    throw new AndroidSubmitPrecheckError(renderAndroidSetupReport(issues), issues)
  }

  return issues
}

/**
 * Android local submit executor. Pre-checks (resolvable + valid service
 * account credentials, resolvable packageName) run first; if any fail, a
 * structured `AndroidSubmitPrecheckError` with the English setup report is
 * thrown WITHOUT any network call. Otherwise the `.aab` is uploaded to Google
 * Play via the 4-step Play Developer API flow (edits.insert →
 * edits.bundles.upload (resumable) → edits.tracks.update → edits.commit).
 */
export async function runLocalAndroidSubmit(params: RunLocalAndroidSubmitParams): Promise<void> {
  const cwd = process.cwd()
  const fetchFn = params.fetchFn ?? fetch

  // --- Resolve packageName (needed for both pre-check and upload) ---
  const config = await loadConfig(cwd)
  const appEnv = process.env.APP_ENV
  const gradlePackageName = await detectPackageName(cwd)
  let appJsonPackageName: string | undefined
  const appJsonPath = join(cwd, 'app.json')
  if (existsSync(appJsonPath)) {
    try {
      const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8')) as Record<string, unknown>
      appJsonPackageName = detectPackageNameFromAppJson(appJson)
    } catch {
      appJsonPackageName = undefined
    }
  }
  const packageName = resolveAndroidPackageName({
    config,
    appEnv,
    gradlePackageName,
    appJsonPackageName,
  })

  // --- Pre-checks (all local, no network) ---
  checkAndroidSubmitPreconditions(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
    packageName,
    (path: string) => readFileSync(path, 'utf8')
  )

  // `packageName` is guaranteed to be a string here (the pre-check above
  // threw if it was undefined).
  if (!packageName) {
    throw new AndroidSubmitPrecheckError(renderAndroidSetupReport({ missingPackageName: true }), {
      missingPackageName: true,
    })
  }

  // The service account is guaranteed present here (the pre-check above
  // threw otherwise) — this guard only narrows the type.
  const credCheck = checkServiceAccountCredential(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
    (path: string) => readFileSync(path, 'utf8')
  )
  if (!credCheck.ok || !credCheck.serviceAccount) {
    throw new AndroidSubmitPrecheckError(renderAndroidSetupReport({ missingCredentials: true }), {
      missingCredentials: true,
    })
  }
  const serviceAccount = credCheck.serviceAccount

  // --- Access token (the only non-injected network call; skipped if provided) ---
  const accessToken = params.accessToken ?? (await getPlayAccessToken(serviceAccount))

  // --- Read the artifact ---
  const aabBytes = readFileSync(params.artifactPath)

  console.log(chalk.bold(`\n  Uploading ${params.artifactPath} to Google Play...`))

  // --- 4-step Play Developer API flow ---
  try {
    const editId = await insertEdit({ packageName, accessToken }, fetchFn)
    const bundle = await uploadBundleResumable(
      {
        packageName,
        editId,
        aabBytes,
        aabSize: aabBytes.length,
        accessToken,
      },
      fetchFn
    )
    const track = resolveGooglePlayTrack(process.env)
    await updateTrack(
      {
        packageName,
        editId,
        track,
        versionCodes: [String(bundle.versionCode)],
        accessToken,
      },
      fetchFn
    )
    await commitEdit({ packageName, editId, accessToken }, fetchFn)

    console.log(
      chalk.bold.green(
        `\n  Google Play submit completed (track: ${track}, versionCode: ${bundle.versionCode}).`
      )
    )
  } catch (err) {
    if (err instanceof PlayApiError) {
      throw new AndroidSubmitApiError(
        `Google Play submit failed: ${err.message}`,
        err,
        params.artifactPath
      )
    }
    throw err
  }
}
