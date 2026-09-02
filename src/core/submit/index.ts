/**
 * Local (non-EAS) submit seam. Both platforms are implemented: iOS uploads
 * the built `.ipa` to App Store Connect via `xcrun altool` (see `./ios.js`);
 * Android uploads the built `.aab` to Google Play via the Google Play
 * Developer API (see `./android.js` + `./play-api.js`).
 */

import { runLocalAndroidSubmit } from './android.js'
import { runLocalIosSubmit } from './ios.js'

export type LocalSubmitPlatform = 'ios' | 'android'

export interface LocalSubmitParams {
  /**
   * Branch key. Never 'all' — the caller (the per-platform loop in
   * commands/build.ts) resolves 'all' into two separate 'ios'/'android'
   * calls, since a single artifact path can only ever have one extension.
   */
  platform: LocalSubmitPlatform
  /** Resolved local artifact path (from resolveArtifactOutput). Input to both executors. */
  artifactPath: string
  /** EAS build profile — header context + store-specific options. */
  profile: string
}

/**
 * Structured "not implemented" error for the local submit seam. Kept exported
 * for backwards compatibility (tests import it); with both platforms now
 * implemented, the dispatch below no longer throws it for `ios`/`android`.
 * Carries a stable `code` and a typed `platform` field so callers and tests
 * can distinguish it from a real submit failure without brittle string
 * matching.
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
 * Runs the platform-specific local submit for a freshly built artifact.
 * `ios` dispatches to the real `xcrun altool` executor (`runLocalIosSubmit`
 * in `./ios.js`); `android` dispatches to the real Google Play Developer API
 * executor (`runLocalAndroidSubmit` in `./android.js`). It is `async`, so
 * errors surface as rejected promises (callers must `await`/`try` them;
 * tests use `assert.rejects`).
 */
export async function runLocalSubmit(params: LocalSubmitParams): Promise<void> {
  if (params.platform === 'ios') {
    await runLocalIosSubmit({ artifactPath: params.artifactPath, profile: params.profile })
    return
  }
  if (params.platform === 'android') {
    await runLocalAndroidSubmit({ artifactPath: params.artifactPath, profile: params.profile })
    return
  }
  // Unreachable for the current `LocalSubmitPlatform` union ('ios' |
  // 'android'); kept as a defensive fallback for a future platform.
  throw new LocalSubmitNotImplementedError(params.platform)
}
