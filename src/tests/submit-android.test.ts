import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  AndroidSubmitPrecheckError,
  checkServiceAccountCredential,
  DEFAULT_GOOGLE_PLAY_TRACK,
  renderAndroidSetupReport,
  resolveAndroidPackageName,
  resolveGooglePlayTrack,
  runLocalAndroidSubmit,
} from '../core/submit/android.js'
import { runLocalSubmit } from '../core/submit/index.js'
import {
  commitEdit,
  type FetchFn,
  insertEdit,
  PlayApiError,
  resolveServiceAccountJson,
  updateTrack,
  uploadBundleResumable,
} from '../core/submit/play-api.js'

import type { RNFConfig } from '../types.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string
  init?: RequestInit
}

/**
 * A fake transport that records every call and returns canned `Response`s in
 * order. `canned` entries may be a `Response` or a `() => Response` factory
 * (for responses that must be built lazily).
 */
function makeFakeFetch(canned: Array<Response | (() => Response)>): {
  fetchFn: FetchFn
  calls: FetchCall[]
} {
  const calls: FetchCall[] = []
  let i = 0
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, init })
    const next = canned[i]
    i += 1
    if (next === undefined) {
      throw new Error(`fakeFetch: unexpected call #${i} to ${url}`)
    }
    return typeof next === 'function' ? next() : next
  }
  return { fetchFn, calls }
}

/** A canned JSON `Response`. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A canned `Response` carrying only headers (no body). */
function withHeaders(status: number, headers: Record<string, string>): Response {
  return new Response(null, { status, headers })
}

const VALID_SA_JSON = JSON.stringify({
  type: 'service_account',
  client_email: 'sa@example.com',
  private_key: 'FAKE_PRIVATE_KEY',
})

const ANDROID_ENV_KEYS = [
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
  'GOOGLE_PLAY_TRACK',
  'APP_ENV',
] as const

function saveAndroidEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {}
  for (const key of ANDROID_ENV_KEYS) saved[key] = process.env[key]
  return saved
}

function restoreAndroidEnv(saved: Record<string, string | undefined>): void {
  for (const key of ANDROID_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
}

function scrubAndroidEnv(): void {
  for (const key of ANDROID_ENV_KEYS) delete process.env[key]
}

// ---------------------------------------------------------------------------
// S1 — pure credential resolver + API client
// ---------------------------------------------------------------------------

describe('resolveServiceAccountJson', () => {
  test('parses inline JSON (a value starting with "{")', () => {
    const sa = resolveServiceAccountJson(VALID_SA_JSON)
    assert.equal(sa.client_email, 'sa@example.com')
    assert.equal(sa.private_key, 'FAKE_PRIVATE_KEY')
    assert.equal(sa.type, 'service_account')
  })

  test('reads a path via the injected readFileSync', () => {
    let readPath: string | undefined
    const sa = resolveServiceAccountJson('/path/to/sa.json', (path) => {
      readPath = path
      return VALID_SA_JSON
    })
    assert.equal(readPath, '/path/to/sa.json')
    assert.equal(sa.client_email, 'sa@example.com')
  })

  test('throws when the value is undefined', () => {
    assert.throws(() => resolveServiceAccountJson(undefined), /not set/)
  })

  test('throws when the value is empty/whitespace', () => {
    assert.throws(() => resolveServiceAccountJson('   '), /empty/)
  })

  test('throws when the JSON is malformed', () => {
    assert.throws(() => resolveServiceAccountJson('{not json'), /not valid JSON/)
  })

  test('throws when client_email is missing', () => {
    assert.throws(
      () => resolveServiceAccountJson(JSON.stringify({ private_key: 'k' })),
      /client_email/
    )
  })

  test('throws when private_key is missing', () => {
    assert.throws(
      () => resolveServiceAccountJson(JSON.stringify({ client_email: 'a@b.c' })),
      /private_key/
    )
  })

  test('throws when type is present but not "service_account"', () => {
    assert.throws(
      () =>
        resolveServiceAccountJson(
          JSON.stringify({ type: 'other', client_email: 'a@b.c', private_key: 'k' })
        ),
      /type/
    )
  })
})

describe('checkServiceAccountCredential', () => {
  test('missing (undefined) → { ok: false, reason: "missing" }', () => {
    assert.deepEqual(checkServiceAccountCredential(undefined), {
      ok: false,
      reason: 'missing',
    })
  })

  test('valid inline JSON → { ok: true, serviceAccount }', () => {
    const result = checkServiceAccountCredential(VALID_SA_JSON)
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.serviceAccount.client_email, 'sa@example.com')
  })

  test('invalid JSON → { ok: false, reason: "invalid", detail }', () => {
    const result = checkServiceAccountCredential('{bad json')
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, 'invalid')
      assert.ok(result.detail.length > 0)
    }
  })
})

describe('resolveAndroidPackageName', () => {
  const config: RNFConfig = {
    platform: 'android',
    outDir: 'keys',
    envs: [{ name: 'prod', googleCloudProjectId: 'p', android: { packageName: 'com.cfg.app' } }],
  }

  test('config env matching appEnv wins', () => {
    assert.equal(
      resolveAndroidPackageName({
        config,
        appEnv: 'prod',
        gradlePackageName: 'com.gradle.app',
        appJsonPackageName: 'com.appjson.app',
      }),
      'com.cfg.app'
    )
  })

  test('falls back to gradle when no config match', () => {
    assert.equal(
      resolveAndroidPackageName({
        config: null,
        appEnv: undefined,
        gradlePackageName: 'com.gradle.app',
        appJsonPackageName: 'com.appjson.app',
      }),
      'com.gradle.app'
    )
  })

  test('falls back to app.json when no gradle', () => {
    assert.equal(
      resolveAndroidPackageName({
        config: null,
        appEnv: undefined,
        gradlePackageName: undefined,
        appJsonPackageName: 'com.appjson.app',
      }),
      'com.appjson.app'
    )
  })

  test('returns undefined when nothing resolves', () => {
    assert.equal(
      resolveAndroidPackageName({
        config: null,
        appEnv: undefined,
        gradlePackageName: undefined,
        appJsonPackageName: undefined,
      }),
      undefined
    )
  })
})

describe('resolveGooglePlayTrack', () => {
  test('defaults to "internal" when unset', () => {
    assert.equal(resolveGooglePlayTrack({}), DEFAULT_GOOGLE_PLAY_TRACK)
    assert.equal(DEFAULT_GOOGLE_PLAY_TRACK, 'internal')
  })

  test('uses the GOOGLE_PLAY_TRACK override (trimmed)', () => {
    assert.equal(resolveGooglePlayTrack({ GOOGLE_PLAY_TRACK: '  production ' }), 'production')
  })

  test('falls back to "internal" when the override is blank', () => {
    assert.equal(resolveGooglePlayTrack({ GOOGLE_PLAY_TRACK: '   ' }), 'internal')
  })
})

describe('renderAndroidSetupReport', () => {
  test('missing-credentials report contains the SA setup steps', () => {
    const report = renderAndroidSetupReport({ missingCredentials: true })
    for (const phrase of [
      'Google Play',
      'service account',
      'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
      'client_email',
      'private_key',
    ]) {
      assert.ok(report.includes(phrase), `expected report to mention "${phrase}"`)
    }
  })

  test('invalid-credentials report mentions the parse requirement', () => {
    const report = renderAndroidSetupReport({ invalidCredentials: true })
    assert.ok(report.includes('could not be parsed'))
  })

  test('missing-packageName report lists the resolution order', () => {
    const report = renderAndroidSetupReport({ missingPackageName: true })
    assert.ok(report.includes('package name'))
    assert.ok(report.includes('build.gradle'))
    assert.ok(report.includes('app.json'))
  })

  test('empty issues renders only the header (no sections)', () => {
    const report = renderAndroidSetupReport({})
    assert.ok(!report.includes('service account'))
    assert.ok(!report.includes('build.gradle'))
  })
})

describe('insertEdit', () => {
  test('returns the edit id on 200', async () => {
    const { fetchFn, calls } = makeFakeFetch([json({ id: 'edit-1' })])
    const id = await insertEdit({ packageName: 'com.example.app', accessToken: 'tok' }, fetchFn)
    assert.equal(id, 'edit-1')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init?.method, 'POST')
    assert.match(calls[0].url, /\/androidpublisher\/v3\/applications\/com\.example\.app\/edits$/)
    assert.equal((calls[0].init?.headers as Record<string, string>)['Authorization'], 'Bearer tok')
  })

  test('throws PlayApiError on a non-2xx', async () => {
    const { fetchFn } = makeFakeFetch([json({ error: 'nope' }, 404)])
    await assert.rejects(
      () => insertEdit({ packageName: 'com.example.app', accessToken: 'tok' }, fetchFn),
      (err: unknown) => {
        assert.ok(err instanceof PlayApiError)
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  test('throws PlayApiError when a 200 has no edit id', async () => {
    const { fetchFn } = makeFakeFetch([json({})])
    await assert.rejects(
      () => insertEdit({ packageName: 'com.example.app', accessToken: 'tok' }, fetchFn),
      (err: unknown) => {
        assert.ok(err instanceof PlayApiError)
        assert.match((err as PlayApiError).message, /no edit id/)
        return true
      }
    )
  })
})

describe('commitEdit', () => {
  test('resolves on 200', async () => {
    const { fetchFn, calls } = makeFakeFetch([json({ id: 'edit-1' })])
    await commitEdit(
      { packageName: 'com.example.app', editId: 'edit-1', accessToken: 'tok' },
      fetchFn
    )
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init?.method, 'POST')
    assert.match(calls[0].url, /\/edits\/edit-1:commit$/)
  })

  test('throws PlayApiError on a non-2xx', async () => {
    const { fetchFn } = makeFakeFetch([json({ error: 'nope' }, 403)])
    await assert.rejects(
      () =>
        commitEdit(
          { packageName: 'com.example.app', editId: 'edit-1', accessToken: 'tok' },
          fetchFn
        ),
      (err: unknown) => {
        assert.ok(err instanceof PlayApiError)
        assert.equal(err.status, 403)
        return true
      }
    )
  })
})

describe('updateTrack', () => {
  test('PUTs the releases payload to the track URL', async () => {
    const { fetchFn, calls } = makeFakeFetch([json({ track: 'internal' })])
    await updateTrack(
      {
        packageName: 'com.example.app',
        editId: 'edit-1',
        track: 'internal',
        versionCodes: ['42'],
        accessToken: 'tok',
      },
      fetchFn
    )
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init?.method, 'PUT')
    assert.match(calls[0].url, /\/edits\/edit-1\/tracks\/internal$/)
    const body = JSON.parse(String(calls[0].init?.body)) as {
      track: string
      releases: Array<{ versionCodes: string[] }>
    }
    assert.equal(body.track, 'internal')
    assert.deepEqual(body.releases, [{ versionCodes: ['42'] }])
  })

  test('throws PlayApiError on a non-2xx', async () => {
    const { fetchFn } = makeFakeFetch([json({ error: 'nope' }, 400)])
    await assert.rejects(
      () =>
        updateTrack(
          {
            packageName: 'com.example.app',
            editId: 'edit-1',
            track: 'internal',
            versionCodes: ['42'],
            accessToken: 'tok',
          },
          fetchFn
        ),
      (err: unknown) => {
        assert.ok(err instanceof PlayApiError)
        assert.equal(err.status, 400)
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// S2 — resumable bundle upload
// ---------------------------------------------------------------------------

describe('uploadBundleResumable', () => {
  const base = {
    packageName: 'com.example.app',
    editId: 'edit-1',
    accessToken: 'tok',
  }

  test('whole-file single PUT → 201 Bundle', async () => {
    const aabBytes = Buffer.from('hello-aab')
    const { fetchFn, calls } = makeFakeFetch([
      withHeaders(200, { location: 'https://session.example/upload' }),
      json({ versionCode: 42, sha1: 'abc', sha256: 'def' }, 201),
    ])
    const bundle = await uploadBundleResumable(
      { ...base, aabBytes, aabSize: aabBytes.length },
      fetchFn
    )
    assert.equal(bundle.versionCode, 42)
    assert.equal(calls.length, 2)
    // Initiate: POST with the X-Upload-Content-* headers + empty body.
    assert.equal(calls[0].init?.method, 'POST')
    assert.match(calls[0].url, /\/bundles\?uploadType=resumable$/)
    const initHeaders = calls[0].init?.headers as Record<string, string>
    assert.equal(initHeaders['X-Upload-Content-Type'], 'application/x-appbundle')
    assert.equal(initHeaders['X-Upload-Content-Length'], String(aabBytes.length))
    // Single PUT: no Content-Range, body is the whole file.
    assert.equal(calls[1].init?.method, 'PUT')
    assert.equal(calls[1].url, 'https://session.example/upload')
    const putHeaders = calls[1].init?.headers as Record<string, string>
    assert.equal(putHeaders['Content-Type'], 'application/x-appbundle')
    assert.equal(putHeaders['Content-Range'], undefined)
  })

  test('chunked upload: 308 (advance from server Range) then 201', async () => {
    const aabBytes = Buffer.alloc(1000, 1)
    const { fetchFn, calls } = makeFakeFetch([
      withHeaders(200, { location: 'https://session.example/upload' }),
      withHeaders(308, { range: 'bytes=0-511' }),
      json({ versionCode: 7 }, 201),
    ])
    const bundle = await uploadBundleResumable(
      { ...base, aabBytes, aabSize: aabBytes.length, chunkSize: 512 },
      fetchFn
    )
    assert.equal(bundle.versionCode, 7)
    assert.equal(calls.length, 3)
    // Chunk 1: bytes 0-511.
    const put1 = calls[1].init?.headers as Record<string, string>
    assert.equal(put1['Content-Range'], 'bytes 0-511/1000')
    // Chunk 2: bytes 512-999 (advanced from the server's Range end 511).
    const put2 = calls[2].init?.headers as Record<string, string>
    assert.equal(put2['Content-Range'], 'bytes 512-999/1000')
  })

  test('404 → restart from byte 0 with a fresh session', async () => {
    const aabBytes = Buffer.alloc(100, 1)
    const { fetchFn, calls } = makeFakeFetch([
      withHeaders(200, { location: 'https://session.example/A' }),
      withHeaders(404, {}),
      withHeaders(200, { location: 'https://session.example/B' }),
      json({ versionCode: 9 }, 201),
    ])
    const bundle = await uploadBundleResumable(
      { ...base, aabBytes, aabSize: aabBytes.length },
      fetchFn
    )
    assert.equal(bundle.versionCode, 9)
    // Two initiate calls (the restart), two PUTs.
    assert.equal(calls.length, 4)
    assert.match(calls[0].url, /\/bundles\?uploadType=resumable$/)
    assert.equal(calls[1].url, 'https://session.example/A')
    assert.match(calls[2].url, /\/bundles\?uploadType=resumable$/)
    assert.equal(calls[3].url, 'https://session.example/B')
  })

  test('initiation with no Location header → PlayApiError', async () => {
    const aabBytes = Buffer.alloc(10, 1)
    const { fetchFn } = makeFakeFetch([withHeaders(200, {})])
    await assert.rejects(
      () => uploadBundleResumable({ ...base, aabBytes, aabSize: aabBytes.length }, fetchFn),
      (err: unknown) => {
        assert.ok(err instanceof PlayApiError)
        assert.match((err as PlayApiError).message, /no Location header/)
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// S3 — executor + seam wiring (integration, fake transport)
// ---------------------------------------------------------------------------

describe('runLocalAndroidSubmit (integration)', () => {
  test('success: full 5-call flow with an injected transport + access token', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-android-ok-'))
    const savedCwd = process.cwd()
    const savedEnv = saveAndroidEnv()

    // Fixtures: a resolvable package name (app.json) + a real .aab artifact.
    await writeFile(
      join(root, 'app.json'),
      JSON.stringify({ expo: { android: { package: 'com.example.app' } } })
    )
    await writeFile(join(root, 'app.aab'), 'aab-bytes')

    process.chdir(root)
    scrubAndroidEnv()
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = VALID_SA_JSON

    const origLog = console.log
    console.log = () => {}

    const { fetchFn, calls } = makeFakeFetch([
      json({ id: 'edit-1' }), // insertEdit
      withHeaders(200, { location: 'https://session.example/upload' }), // initiate
      json({ versionCode: 42, sha1: 'abc', sha256: 'def' }, 201), // single PUT
      json({ track: 'internal' }), // updateTrack
      json({ id: 'edit-1' }), // commitEdit
    ])

    try {
      await runLocalAndroidSubmit({
        artifactPath: 'app.aab',
        profile: 'production',
        fetchFn,
        accessToken: 'fake-token',
      })
    } finally {
      console.log = origLog
      process.chdir(savedCwd)
      restoreAndroidEnv(savedEnv)
      await rm(root, { recursive: true, force: true })
    }

    assert.equal(calls.length, 5)
    assert.equal(calls[0].init?.method, 'POST')
    assert.match(calls[0].url, /\/androidpublisher\/v3\/applications\/com\.example\.app\/edits$/)
    assert.match(
      calls[1].url,
      /\/upload\/androidpublisher\/v3\/applications\/com\.example\.app\/edits\/edit-1\/bundles\?uploadType=resumable$/
    )
    assert.equal(calls[1].init?.method, 'POST')
    assert.equal(calls[2].url, 'https://session.example/upload')
    assert.equal(calls[2].init?.method, 'PUT')
    assert.match(calls[3].url, /\/edits\/edit-1\/tracks\/internal$/)
    assert.equal(calls[3].init?.method, 'PUT')
    assert.match(calls[4].url, /\/edits\/edit-1:commit$/)
    assert.equal(calls[4].init?.method, 'POST')
    // Every call carries the injected Bearer token.
    for (const call of calls) {
      assert.equal(
        (call.init?.headers as Record<string, string>)['Authorization'],
        'Bearer fake-token'
      )
    }
  })

  test('pre-check failure (missing credentials) → structured error, no network', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-android-nocred-'))
    const savedCwd = process.cwd()
    const savedEnv = saveAndroidEnv()

    process.chdir(root) // no app.json, no gradle → nothing to resolve
    scrubAndroidEnv() // no GOOGLE_PLAY_SERVICE_ACCOUNT_JSON

    const { fetchFn, calls } = makeFakeFetch([])

    try {
      await assert.rejects(
        () =>
          runLocalAndroidSubmit({
            artifactPath: 'app.aab',
            profile: 'production',
            fetchFn,
            accessToken: 'fake-token',
          }),
        (err: unknown) => {
          assert.ok(err instanceof AndroidSubmitPrecheckError)
          assert.equal(err.code, 'ANDROID_SUBMIT_PRECHECK_FAILED')
          assert.equal(err.issues.missingCredentials, true)
          return true
        }
      )
    } finally {
      process.chdir(savedCwd)
      restoreAndroidEnv(savedEnv)
      await rm(root, { recursive: true, force: true })
    }

    // No network: the pre-check failed before any fetch.
    assert.equal(calls.length, 0)
  })
})

describe('runLocalSubmit (android seam wiring)', () => {
  test('android dispatches to the real executor (pre-check error, not not-implemented)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-android-seam-'))
    const savedCwd = process.cwd()
    const savedEnv = saveAndroidEnv()

    process.chdir(root)
    scrubAndroidEnv()

    try {
      await assert.rejects(
        () =>
          runLocalSubmit({
            platform: 'android',
            artifactPath: 'build/android/app.aab',
            profile: 'production',
          }),
        (err: unknown) => {
          // The android branch reached the real executor (its pre-check error,
          // not the old LocalSubmitNotImplementedError).
          assert.ok(err instanceof AndroidSubmitPrecheckError)
          assert.equal(err.code, 'ANDROID_SUBMIT_PRECHECK_FAILED')
          assert.equal(err.issues.missingCredentials, true)
          return true
        }
      )
    } finally {
      process.chdir(savedCwd)
      restoreAndroidEnv(savedEnv)
      await rm(root, { recursive: true, force: true })
    }
  })
})
