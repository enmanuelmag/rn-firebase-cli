/**
 * Local (non-EAS) submit seam. Task 1 (foundation) throws a structured
 * "not implemented" error for every platform; follow-up tasks replace the
 * body with per-platform branches (iOS via `xcrun altool`, Android via the
 * Google Play Developer API).
 */

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
 * Task 1 throws `LocalSubmitNotImplementedError` for every platform — this
 * is a seam that follow-up tasks replace with real per-platform logic.
 * It is `async`, so the throw surfaces as a rejected promise (callers must
 * `await`/`try` it; tests use `assert.rejects`).
 */
export async function runLocalSubmit(params: LocalSubmitParams): Promise<void> {
  throw new LocalSubmitNotImplementedError(params.platform)
}
