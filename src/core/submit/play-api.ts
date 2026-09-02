import { readFileSync } from 'node:fs'
import { JWT } from 'google-auth-library'

/**
 * Google Play Developer API (androidpublisher v3) client — hand-rolled REST
 * over the built-in `fetch`, with an injected transport (`FetchFn`) for
 * testability. Auth is a service-account JWT (via `google-auth-library`)
 * whose access token is attached manually to each request, so auth and
 * transport stay decoupled (no `client.fetch()`).
 */

/** Injected HTTP transport. Defaults to the global `fetch` (Node >= 22.5). */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

/** A Google service-account JSON (the subset this client needs). */
export interface ServiceAccountJson {
  type?: string
  client_email: string
  private_key: string
  [key: string]: unknown
}

/** The Google Play Developer API host. */
export const PLAY_API_HOST = 'https://androidpublisher.googleapis.com'

/** The OAuth scope for the Google Play Developer API. */
const ANDROIDPUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher'

/**
 * Structured failure for a Google Play API request that returned a non-2xx
 * status (or a malformed 2xx). Carries a stable `code` + the HTTP status +
 * url + body so callers and tests can distinguish it from a pre-check
 * failure without brittle string matching.
 */
export class PlayApiError extends Error {
  readonly code = 'PLAY_API_FAILED'
  readonly status: number
  readonly url: string
  readonly body?: string

  constructor(params: { status: number; url: string; body?: string; message?: string }) {
    super(
      params.message ??
        `Google Play API request failed with status ${params.status} (${params.url})`
    )
    this.name = 'PlayApiError'
    this.status = params.status
    this.url = params.url
    this.body = params.body
  }
}

/**
 * Pure path-vs-inline resolver for `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
 * Heuristic: a trimmed value starting with `{` is parsed as inline JSON;
 * anything else is treated as a path to a service-account JSON file and read
 * via the (injected) `readFileSync`. The result is validated to have
 * `client_email` + `private_key` (and, if present, `type === 'service_account'`).
 * Throws a descriptive `Error` on any problem.
 */
export function resolveServiceAccountJson(
  raw: string | undefined,
  readFileSyncFn: (path: string) => string = (path) => readFileSync(path, 'utf8')
): ServiceAccountJson {
  if (raw === undefined) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set')
  }
  const trimmed = raw.trim()
  if (trimmed === '') {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is empty')
  }

  const jsonText = trimmed.startsWith('{') ? trimmed : readFileSyncFn(trimmed)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    throw new Error(`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON: ${(err as Error).message}`)
  }

  const sa = parsed as Partial<ServiceAccountJson>
  if (typeof sa.client_email !== 'string' || sa.client_email === '') {
    throw new Error('service account JSON is missing a non-empty "client_email"')
  }
  if (typeof sa.private_key !== 'string' || sa.private_key === '') {
    throw new Error('service account JSON is missing a non-empty "private_key"')
  }
  if (sa.type !== undefined && sa.type !== 'service_account') {
    throw new Error(
      `service account JSON "type" must be "service_account", got "${String(sa.type)}"`
    )
  }
  return sa as ServiceAccountJson
}

/**
 * Build a JWT client for the androidpublisher scope and fetch a single access
 * token. This is the only function in this module that performs a network
 * call (to the Google token endpoint); the Play API functions below take the
 * token as input instead, so auth and transport stay decoupled.
 */
export async function getPlayAccessToken(sa: ServiceAccountJson): Promise<string> {
  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [ANDROIDPUBLISHER_SCOPE],
  })
  const { token } = await client.getAccessToken()
  if (!token) {
    throw new Error('google-auth-library did not return an access token')
  }
  return token
}

// ---------------------------------------------------------------------------
// edits.insert / edits.commit / edits.tracks.update
// ---------------------------------------------------------------------------

export interface InsertEditParams {
  packageName: string
  accessToken: string
}

/** `edits.insert` — start a new edit for the app. Returns the new edit id. */
export async function insertEdit(
  params: InsertEditParams,
  fetchFn: FetchFn = fetch
): Promise<string> {
  const url =
    `${PLAY_API_HOST}/androidpublisher/v3/applications/` +
    `${encodeURIComponent(params.packageName)}/edits`
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: '{}',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => undefined)
    throw new PlayApiError({ status: res.status, url, body })
  }
  const parsed = (await res.json().catch(() => ({}))) as { id?: string }
  if (!parsed.id) {
    throw new PlayApiError({ status: res.status, url, message: 'edits.insert returned no edit id' })
  }
  return parsed.id
}

export interface CommitEditParams {
  packageName: string
  editId: string
  accessToken: string
}

/** `edits.commit` — commit the edit (publish the staged changes). */
export async function commitEdit(
  params: CommitEditParams,
  fetchFn: FetchFn = fetch
): Promise<void> {
  const url =
    `${PLAY_API_HOST}/androidpublisher/v3/applications/${encodeURIComponent(params.packageName)}` +
    `/edits/${encodeURIComponent(params.editId)}:commit`
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: '{}',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => undefined)
    throw new PlayApiError({ status: res.status, url, body })
  }
}

export interface UpdateTrackParams {
  packageName: string
  editId: string
  track: string
  versionCodes: string[]
  accessToken: string
}

/** `edits.tracks.update` — release the given version codes to the track. */
export async function updateTrack(
  params: UpdateTrackParams,
  fetchFn: FetchFn = fetch
): Promise<void> {
  const url =
    `${PLAY_API_HOST}/androidpublisher/v3/applications/${encodeURIComponent(params.packageName)}` +
    `/edits/${encodeURIComponent(params.editId)}/tracks/${encodeURIComponent(params.track)}`
  const payload = JSON.stringify({
    track: params.track,
    releases: [{ versionCodes: params.versionCodes }],
  })
  const res = await fetchFn(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: payload,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => undefined)
    throw new PlayApiError({ status: res.status, url, body })
  }
}

// ---------------------------------------------------------------------------
// edits.bundles.upload — resumable media upload (standard Content-Range
// protocol: initiate → session PUT(s) with Content-Range → 201 Bundle).
// ---------------------------------------------------------------------------

export interface UploadBundleParams {
  packageName: string
  editId: string
  aabBytes: Buffer
  aabSize: number
  accessToken: string
  /**
   * Chunk size in bytes (a multiple of 256 KB). Omit to upload the whole
   * file in a single PUT.
   */
  chunkSize?: number
  /** Per-PUT timeout in ms. Default 120000 (120 s). */
  timeoutMs?: number
}

/** The `Bundle` returned by a successful `edits.bundles.upload`. */
export interface UploadedBundle {
  versionCode: number
  sha1?: string
  sha256?: string
}

/**
 * Upload a `.aab` to a Play edit via the standard Content-Range resumable
 * protocol:
 *
 * 1. Initiate: `POST .../bundles?uploadType=resumable` (empty body) → 200 +
 *    a `Location` header (the session URI).
 * 2. Upload: `PUT <session>` with `Content-Length` + `Content-Type` (+
 *    `Content-Range` when chunking). A whole-file single PUT → 201 `Bundle`;
 *    chunked intermediate PUTs → 308 + a `Range` header (advance from the
 *    server's `Range`, never our own offset); the final PUT → 201 `Bundle`.
 *
 * Edge cases: 5xx → retry with exponential backoff (`2^n + random(<=1000ms)`,
 * n=0..5), then query status (an empty PUT with a wildcard Content-Range) to
 * resume; 404/410 → restart from byte 0 with a fresh session.
 */
export async function uploadBundleResumable(
  params: UploadBundleParams,
  fetchFn: FetchFn = fetch
): Promise<UploadedBundle> {
  const total = params.aabSize
  const timeoutMs = params.timeoutMs ?? 120_000
  const chunkSize = params.chunkSize ?? total

  let sessionUri = await initiateResumableUpload(params, fetchFn)
  let offset = 0

  for (;;) {
    if (offset >= total) {
      // All bytes sent but no final 201 yet — confirm via a status query.
      const result = await resumeFromStatus(params, fetchFn, sessionUri, total, timeoutMs)
      sessionUri = result.sessionUri
      offset = result.offset
      if (result.bundle) return result.bundle
      continue
    }

    const first = offset
    const last = Math.min(first + chunkSize - 1, total - 1)
    const chunkBytes = params.aabBytes.subarray(first, last + 1)
    const isSinglePut = total <= chunkSize

    const res = await putChunkWithRetry(
      params,
      fetchFn,
      sessionUri,
      first,
      last,
      chunkBytes,
      total,
      isSinglePut,
      timeoutMs
    )

    if (res.status === 200 || res.status === 201) {
      return await parseBundle(res)
    }
    if (res.status === 308) {
      const serverEnd = parseRangeEnd(res.headers.get('range'))
      if (serverEnd < 0) {
        // No usable Range header — restart from byte 0 with a fresh session.
        sessionUri = await initiateResumableUpload(params, fetchFn)
        offset = 0
        continue
      }
      // Advance from the server's Range, never our own offset.
      offset = serverEnd + 1
      continue
    }
    if (res.status === 404 || res.status === 410) {
      // Session unknown/expired — restart from byte 0 with a fresh session.
      sessionUri = await initiateResumableUpload(params, fetchFn)
      offset = 0
      continue
    }
    if (res.status >= 500) {
      // Retries exhausted — query the server's state to resume rather than abort.
      const result = await resumeFromStatus(params, fetchFn, sessionUri, total, timeoutMs)
      sessionUri = result.sessionUri
      offset = result.offset
      if (result.bundle) return result.bundle
      continue
    }
    // Any other status is a hard failure.
    const body = await res.text().catch(() => undefined)
    throw new PlayApiError({ status: res.status, url: sessionUri, body })
  }
}

/**
 * Initiate a resumable upload session: `POST .../bundles?uploadType=resumable`
 * with an empty body + the `X-Upload-Content-*` headers. Returns the session
 * URI from the `Location` header.
 */
async function initiateResumableUpload(
  params: UploadBundleParams,
  fetchFn: FetchFn
): Promise<string> {
  const url =
    `${PLAY_API_HOST}/upload/androidpublisher/v3/applications/` +
    `${encodeURIComponent(params.packageName)}/edits/${encodeURIComponent(params.editId)}` +
    '/bundles?uploadType=resumable'
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'X-Upload-Content-Type': 'application/x-appbundle',
      'X-Upload-Content-Length': String(params.aabSize),
      'Content-Length': '0',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: '',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => undefined)
    throw new PlayApiError({ status: res.status, url, body })
  }
  const location = res.headers.get('location')
  if (!location) {
    throw new PlayApiError({
      status: res.status,
      url,
      message: 'resumable upload initiation returned no Location header',
    })
  }
  return location
}

/**
 * One chunk PUT with 5xx retry (exponential backoff `2^n + random(<=1000ms)`,
 * n=0..5 → up to 6 attempts). `Content-Range` is only sent when chunking
 * (not for a whole-file single PUT).
 */
async function putChunkWithRetry(
  params: UploadBundleParams,
  fetchFn: FetchFn,
  sessionUri: string,
  first: number,
  last: number,
  chunkBytes: Uint8Array,
  total: number,
  isSinglePut: boolean,
  timeoutMs: number
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-appbundle',
    'Content-Length': String(chunkBytes.length),
    Authorization: `Bearer ${params.accessToken}`,
  }
  if (!isSinglePut) {
    headers['Content-Range'] = `bytes ${first}-${last}/${total}`
  }

  const doPut = (): Promise<Response> => {
    const { signal, clear } = withTimeout(timeoutMs)
    try {
      return fetchFn(sessionUri, {
        method: 'PUT',
        headers,
        // A `Buffer` is a valid fetch body at runtime. The cast papers over a
        // known @types-node/undici mismatch where `Buffer<ArrayBufferLike>` is
        // not structurally matched against the shared-ArrayBuffer `BodyInit`.
        body: chunkBytes as unknown as RequestInit['body'],
        signal,
      })
    } finally {
      clear()
    }
  }

  for (let n = 0; n < 5; n++) {
    const res = await doPut()
    if (res.status < 500) return res
    // 5xx — exponential backoff: 2^n + random(<=1000ms), n=0..4.
    await sleep(2 ** n + Math.floor(Math.random() * 1000))
  }
  // Final attempt (the 6th, n=5) — no backoff after it.
  return doPut()
}

/**
 * Query the upload's status with an empty PUT carrying a wildcard
 * Content-Range header. Returns the resulting session/offset (and the bundle
 * if the upload is already complete). Used to resume after a 5xx or when all
 * bytes have been sent but no final 201 was observed.
 */
async function resumeFromStatus(
  params: UploadBundleParams,
  fetchFn: FetchFn,
  sessionUri: string,
  total: number,
  timeoutMs: number
): Promise<{ bundle?: UploadedBundle; sessionUri: string; offset: number }> {
  const { signal, clear } = withTimeout(timeoutMs)
  let statusRes: Response
  try {
    statusRes = await fetchFn(sessionUri, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes */${total}`,
        Authorization: `Bearer ${params.accessToken}`,
      },
      signal,
    })
  } finally {
    clear()
  }

  if (statusRes.status === 200 || statusRes.status === 201) {
    return { bundle: await parseBundle(statusRes), sessionUri, offset: total }
  }
  if (statusRes.status === 308) {
    const serverEnd = parseRangeEnd(statusRes.headers.get('range'))
    if (serverEnd < 0) {
      const fresh = await initiateResumableUpload(params, fetchFn)
      return { sessionUri: fresh, offset: 0 }
    }
    return { sessionUri, offset: serverEnd + 1 }
  }
  if (statusRes.status === 404 || statusRes.status === 410) {
    const fresh = await initiateResumableUpload(params, fetchFn)
    return { sessionUri: fresh, offset: 0 }
  }
  const body = await statusRes.text().catch(() => undefined)
  throw new PlayApiError({ status: statusRes.status, url: sessionUri, body })
}

/** Parse a 201 `Bundle` response body, requiring a numeric `versionCode`. */
async function parseBundle(res: Response): Promise<UploadedBundle> {
  const parsed = (await res.json().catch(() => ({}))) as Partial<UploadedBundle>
  if (typeof parsed.versionCode !== 'number') {
    throw new PlayApiError({
      status: res.status,
      url: 'bundle upload',
      message: 'bundle upload response has no numeric versionCode',
    })
  }
  return { versionCode: parsed.versionCode, sha1: parsed.sha1, sha256: parsed.sha256 }
}

/** Parse the end offset out of a `Range: bytes=<first>-<last>` header. */
function parseRangeEnd(rangeHeader: string | null): number {
  if (!rangeHeader) return -1
  const match = rangeHeader.match(/bytes=(\d+)-(\d+)/i)
  if (!match) return -1
  return Number(match[2])
}

/**
 * An `AbortSignal` that aborts after `ms`, with a `clear()` to cancel the
 * pending timer (so a completed request doesn't leave a ref'd timer behind).
 */
function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`request timed out after ${ms}ms`))
  }, ms)
  const maybeUnref = (timer as { unref?: () => void }).unref
  if (typeof maybeUnref === 'function') maybeUnref.call(timer)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
