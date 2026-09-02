/**
 * Local (non-EAS) submit seam. iOS is implemented — it uploads the built
 * `.ipa` to App Store Connect via `xcrun altool` (see `./ios.js`); Android
 * remains a not-implemented seam that the Google Play Developer API
 * follow-up replaces.
 */

import { runLocalIosSubmit } from './ios.js'

export type LocalSubmitPlatform = 'ios' | 'android'

export interface LocalSubmitParams {
  /**
   * Branch key. Never 'all' — the caller (the per-platform loop in
   * commands/build.ts) resolves 'all' into two separate 'ios'/'android'
   * calls, since a single artifact path can only ever have one extension.
   */
  platform: LocalSubmitPlatform
  /** Resolved local artifact path (from resolveArtifactOutput). Input to both follow-ups. */
  artifactPath: string
  /** EAS build profile — header context + future store-specific options. */
  profile: string
}

/**
 * Structured "not implemented" error for the local submit seam. Carries a
 * stable `code` and a typed `platform` field so callers and tests can
 * distinguish it from a real submit failure without brittle string matching.
 */
export class LocalSubmitNotImplementedError extends Error {
  readonly code = 'LOCAL_SUBMIT_NOT_IMPLEMENTED'
  readonly platform: LocalSubmitPlatform

  constructor(platform: LocalSubmitPlatform) {
    super(`Local submit is not implemented for platform "${platform}" yet.`)
    this.name = 'LocalSubmitNotImplementedError'
    this.platform = platform
  }
}

/**
 * Spawns the platform-specific local submit for a freshly built artifact.
 * `ios` dispatches to the real `xcrun altool` executor (`runLocalIosSubmit`
 * in `./ios.js`); `android` still throws `LocalSubmitNotImplementedError`
 * (the Google Play Developer API follow-up replaces that branch).
 * It is `async`, so errors surface as rejected promises (callers must
 * `await`/`try` them; tests use `assert.rejects`).
 */
export async function runLocalSubmit(params: LocalSubmitParams): Promise<void> {
  if (params.platform === 'ios') {
    await runLocalIosSubmit({ artifactPath: params.artifactPath, profile: params.profile })
    return
  }
  throw new LocalSubmitNotImplementedError(params.platform)
}
