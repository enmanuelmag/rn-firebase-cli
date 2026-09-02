import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { AndroidSubmitPrecheckError } from '../core/submit/android.js'
import { LocalSubmitNotImplementedError, runLocalSubmit } from '../core/submit/index.js'
import {
  buildAltoolUploadArgs,
  buildAltoolValidateArgs,
  findP8Key,
  findXcrunInPath,
  IosSubmitPrecheckError,
  IosSubmitSpawnError,
  isMacOS,
  renderIosSetupReport,
  renderNonMacOsMessage,
  resolveIosCredentials,
  runLocalIosSubmit,
} from '../core/submit/ios.js'

// ---------------------------------------------------------------------------
// S1 — pure credential + arg builders
// ---------------------------------------------------------------------------

describe('findP8Key', () => {
  test('returns the first AuthKey_<id>.p8 found in the search dirs (in order)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-p8-'))
    try {
      const dirA = join(root, 'a')
      const dirB = join(root, 'b')
      await mkdir(dirA, { recursive: true })
      await mkdir(dirB, { recursive: true })
      await writeFile(join(dirB, 'AuthKey_K1.p8'), 'key')
      assert.equal(findP8Key('K1', [dirA, dirB]), join(dirB, 'AuthKey_K1.p8'))

      // First dir wins when both contain the key.
      await writeFile(join(dirA, 'AuthKey_K2.p8'), 'key')
      await writeFile(join(dirB, 'AuthKey_K2.p8'), 'key')
      assert.equal(findP8Key('K2', [dirA, dirB]), join(dirA, 'AuthKey_K2.p8'))

      assert.equal(findP8Key('MISSING', [dirA, dirB]), undefined)
      assert.equal(findP8Key('K1', []), undefined)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('resolveIosCredentials', () => {
  let cwd: string
  let home: string
  let origCwd: string

  beforeEach(async () => {
    origCwd = process.cwd()
    cwd = await mkdtemp(join(tmpdir(), 'rfc-cred-cwd-'))
    home = await mkdtemp(join(tmpdir(), 'rfc-cred-home-'))
    process.chdir(cwd)
  })

  afterEach(async () => {
    process.chdir(origCwd)
    await rm(cwd, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  })

  test('resolves the ASC API key from ./private_keys (cwd)', async () => {
    await mkdir(join(cwd, 'private_keys'), { recursive: true })
    await writeFile(join(cwd, 'private_keys', 'AuthKey_KEY1.p8'), 'key')
    const creds = resolveIosCredentials({
      ASC_API_KEY_ID: 'KEY1',
      ASC_API_ISSUER_ID: 'ISS1',
      HOME: home,
    })
    // process.cwd() is canonicalized (e.g. /private/var/... on macOS), so the
    // expected path must be built from it, not the raw mkdtemp string.
    assert.deepEqual(creds, {
      kind: 'api-key',
      p8Path: join(process.cwd(), 'private_keys', 'AuthKey_KEY1.p8'),
      apiIssuerId: 'ISS1',
      apiKeyId: 'KEY1',
    })
  })

  test('resolves the ASC API key from $HOME/private_keys', async () => {
    await mkdir(join(home, 'private_keys'), { recursive: true })
    await writeFile(join(home, 'private_keys', 'AuthKey_KEY1.p8'), 'key')
    const creds = resolveIosCredentials({
      ASC_API_KEY_ID: 'KEY1',
      ASC_API_ISSUER_ID: 'ISS1',
      HOME: home,
    })
    assert.deepEqual(creds, {
      kind: 'api-key',
      p8Path: join(home, 'private_keys', 'AuthKey_KEY1.p8'),
      apiIssuerId: 'ISS1',
      apiKeyId: 'KEY1',
    })
  })

  test('resolves the ASC API key from $HOME/.private_keys', async () => {
    const dir = join(home, '.private_keys')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'AuthKey_KEY1.p8'), 'key')
    const creds = resolveIosCredentials({
      ASC_API_KEY_ID: 'KEY1',
      ASC_API_ISSUER_ID: 'ISS1',
      HOME: home,
    })
    assert.deepEqual(creds, {
      kind: 'api-key',
      p8Path: join(dir, 'AuthKey_KEY1.p8'),
      apiIssuerId: 'ISS1',
      apiKeyId: 'KEY1',
    })
  })

  test('precedence: $HOME/private_keys (location 2) beats $HOME/.private_keys (location 3)', async () => {
    await mkdir(join(home, 'private_keys'), { recursive: true })
    await writeFile(join(home, 'private_keys', 'AuthKey_KEY1.p8'), 'key')
    const hiddenDir = join(home, '.private_keys')
    await mkdir(hiddenDir, { recursive: true })
    await writeFile(join(hiddenDir, 'AuthKey_KEY1.p8'), 'key')
    const creds = resolveIosCredentials({
      ASC_API_KEY_ID: 'KEY1',
      ASC_API_ISSUER_ID: 'ISS1',
      HOME: home,
    })
    // The earlier location ($HOME/private_keys) wins.
    assert.deepEqual(creds, {
      kind: 'api-key',
      p8Path: join(home, 'private_keys', 'AuthKey_KEY1.p8'),
      apiIssuerId: 'ISS1',
      apiKeyId: 'KEY1',
    })
  })

  test('precedence: $HOME/.private_keys (location 3) beats $HOME/.appstoreconnect/private_keys (location 4)', async () => {
    const hiddenDir = join(home, '.private_keys')
    await mkdir(hiddenDir, { recursive: true })
    await writeFile(join(hiddenDir, 'AuthKey_KEY1.p8'), 'key')
    const appstoreconnectDir = join(home, '.appstoreconnect', 'private_keys')
    await mkdir(appstoreconnectDir, { recursive: true })
    await writeFile(join(appstoreconnectDir, 'AuthKey_KEY1.p8'), 'key')
    const creds = resolveIosCredentials({
      ASC_API_KEY_ID: 'KEY1',
      ASC_API_ISSUER_ID: 'ISS1',
      HOME: home,
    })
    // The earlier location ($HOME/.private_keys) wins.
    assert.deepEqual(creds, {
      kind: 'api-key',
      p8Path: join(hiddenDir, 'AuthKey_KEY1.p8'),
      apiIssuerId: 'ISS1',
      apiKeyId: 'KEY1',
    })
  })

  test('resolves the ASC API key from $HOME/.appstoreconnect/private_keys', async () => {
    const dir = join(home, '.appstoreconnect', 'private_keys')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'AuthKey_KEY1.p8'), 'key')
    const creds = resolveIosCredentials({
      ASC_API_KEY_ID: 'KEY1',
      ASC_API_ISSUER_ID: 'ISS1',
      HOME: home,
    })
    assert.deepEqual(creds, {
      kind: 'api-key',
      p8Path: join(dir, 'AuthKey_KEY1.p8'),
      apiIssuerId: 'ISS1',
      apiKeyId: 'KEY1',
    })
  })

  test('resolves the ASC API key from $API_PRIVATE_KEYS_DIR', async () => {
    const dir = join(home, 'custom-keys')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'AuthKey_KEY1.p8'), 'key')
    const creds = resolveIosCredentials({
      ASC_API_KEY_ID: 'KEY1',
      ASC_API_ISSUER_ID: 'ISS1',
      HOME: home,
      API_PRIVATE_KEYS_DIR: dir,
    })
    assert.deepEqual(creds, {
      kind: 'api-key',
      p8Path: join(dir, 'AuthKey_KEY1.p8'),
      apiIssuerId: 'ISS1',
      apiKeyId: 'KEY1',
    })
  })

  test('falls back to the app-specific password when no .p8 key is found', async () => {
    const creds = resolveIosCredentials({
      ASC_API_KEY_ID: 'KEY1',
      ASC_API_ISSUER_ID: 'ISS1',
      ASC_APPLE_ID: 'dev@example.com',
      ASC_APP_PASSWORD: 'xxxx',
      HOME: home,
    })
    assert.deepEqual(creds, { kind: 'apple-id', appleId: 'dev@example.com', appPassword: 'xxxx' })
  })

  test('prefers the ASC API key over the app-specific password when both are available', async () => {
    await mkdir(join(cwd, 'private_keys'), { recursive: true })
    await writeFile(join(cwd, 'private_keys', 'AuthKey_KEY1.p8'), 'key')
    const creds = resolveIosCredentials({
      ASC_API_KEY_ID: 'KEY1',
      ASC_API_ISSUER_ID: 'ISS1',
      ASC_APPLE_ID: 'dev@example.com',
      ASC_APP_PASSWORD: 'xxxx',
      HOME: home,
    })
    assert.equal(creds?.kind, 'api-key')
  })

  test('returns undefined when no credentials are resolvable', () => {
    assert.equal(resolveIosCredentials({ HOME: home }), undefined)
    // Key id set but no issuer id → the api-key branch is skipped.
    assert.equal(
      resolveIosCredentials({
        ASC_API_KEY_ID: 'KEY1',
        ASC_APPLE_ID: 'dev@example.com',
        HOME: home,
      }),
      undefined
    )
  })
})

describe('buildAltoolUploadArgs', () => {
  test('api-key variant appends --apiKey/--apiIssuer', () => {
    assert.deepEqual(
      buildAltoolUploadArgs('out/ios/app-1.0.0-prod-dev.ipa', {
        kind: 'api-key',
        p8Path: '/keys/AuthKey_K.p8',
        apiIssuerId: 'ISS',
        apiKeyId: 'K',
      }),
      [
        'altool',
        '--upload-app',
        '-f',
        'out/ios/app-1.0.0-prod-dev.ipa',
        '-t',
        'ios',
        '--apiKey',
        '/keys/AuthKey_K.p8',
        '--apiIssuer',
        'ISS',
      ]
    )
  })

  test('apple-id variant appends -u/-p', () => {
    assert.deepEqual(
      buildAltoolUploadArgs('a.ipa', {
        kind: 'apple-id',
        appleId: 'dev@example.com',
        appPassword: 'pw',
      }),
      ['altool', '--upload-app', '-f', 'a.ipa', '-t', 'ios', '-u', 'dev@example.com', '-p', 'pw']
    )
  })
})

describe('buildAltoolValidateArgs', () => {
  test('builds the altool --validate-app command array', () => {
    assert.deepEqual(buildAltoolValidateArgs('a.ipa'), ['altool', '--validate-app', '-f', 'a.ipa'])
  })
})

// ---------------------------------------------------------------------------
// S2 — pure pre-checks + setup-message renderers
// ---------------------------------------------------------------------------

describe('isMacOS', () => {
  test('true for darwin, false for other platforms', () => {
    assert.equal(isMacOS('darwin'), true)
    assert.equal(isMacOS('linux'), false)
    assert.equal(isMacOS('win32'), false)
  })
})

describe('findXcrunInPath', () => {
  test('returns the first xcrun executable found in the dir list', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-xcrun-'))
    try {
      const withXcrun = join(root, 'with')
      const without = join(root, 'without')
      await mkdir(withXcrun, { recursive: true })
      await mkdir(without, { recursive: true })
      const xcrunPath = join(withXcrun, 'xcrun')
      await writeFile(xcrunPath, '#!/bin/sh\nexit 0\n')
      await chmod(xcrunPath, 0o755)
      assert.equal(findXcrunInPath([without, withXcrun]), xcrunPath)
      assert.equal(findXcrunInPath([without]), undefined)
      assert.equal(findXcrunInPath([]), undefined)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('renderIosSetupReport', () => {
  test('missing-credentials report contains the exact ASC setup steps', () => {
    const report = renderIosSetupReport({ missingCredentials: true })
    for (const phrase of [
      'App Store Connect',
      'Users and Access',
      'Integrations',
      'App Store Connect API',
      'Team Keys',
      'Generate API Key',
      'one-time download',
      './private_keys',
      '$HOME/private_keys',
      '$HOME/.private_keys',
      '$HOME/.appstoreconnect/private_keys',
      '$API_PRIVATE_KEYS_DIR',
      'ASC_API_KEY_ID',
      'ASC_API_ISSUER_ID',
      'API_PRIVATE_KEYS_DIR',
      'appleid.apple.com',
      'ASC_APPLE_ID',
      'ASC_APP_PASSWORD',
    ]) {
      assert.ok(report.includes(phrase), `expected report to mention "${phrase}"`)
    }
  })

  test('missing-xcrun report mentions installing Xcode', () => {
    const report = renderIosSetupReport({ missingXcrun: true })
    assert.ok(report.includes('xcrun'))
    assert.ok(report.includes('Xcode'))
    // No credential section when credentials are not the issue.
    assert.ok(!report.includes('Generate API Key'))
  })

  test('empty issues renders only the header (no sections)', () => {
    const report = renderIosSetupReport({})
    assert.ok(!report.includes('Generate API Key'))
    assert.ok(!report.includes('Xcode'))
  })
})

describe('renderNonMacOsMessage', () => {
  test('states the macOS + Xcode requirement', () => {
    const message = renderNonMacOsMessage()
    assert.ok(message.includes('macOS'))
    assert.ok(message.includes('Xcode'))
    assert.ok(message.includes('altool is macOS-only'))
  })
})

// ---------------------------------------------------------------------------
// S3 — executor + seam wiring (integration, fake-binary-on-PATH)
// ---------------------------------------------------------------------------

const ASC_ENV_KEYS = [
  'ASC_API_KEY_ID',
  'ASC_API_ISSUER_ID',
  'ASC_APPLE_ID',
  'ASC_APP_PASSWORD',
  'API_PRIVATE_KEYS_DIR',
] as const

function saveAscEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {}
  for (const key of ASC_ENV_KEYS) saved[key] = process.env[key]
  return saved
}

function restoreAscEnv(saved: Record<string, string | undefined>): void {
  for (const key of ASC_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
}

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

/**
 * Fake-binary-on-PATH technique (analogous to withFakeEas in
 * build.test.ts): writes a no-op `xcrun` shell script that records its argv
 * (NUL-separated) to `argvFile` and exits with `exitCode`.
 */
async function makeFakeXcrun(argvFile: string, exitCode = 0): Promise<string> {
  const binDir = await mkdtemp(join(tmpdir(), 'rfc-fake-xcrun-'))
  const xcrunPath = join(binDir, 'xcrun')
  await writeFile(xcrunPath, `#!/bin/sh\nprintf '%s\\0' "$@" > "${argvFile}"\nexit ${exitCode}\n`)
  await chmod(xcrunPath, 0o755)
  return binDir
}

/** Runs `fn` with `binDir` prepended to PATH (restored in finally). */
async function withPrependedPath(binDir: string, fn: () => Promise<void>): Promise<void> {
  const savedPath = process.env.PATH
  process.env.PATH = `${binDir}:${savedPath}`
  try {
    await fn()
  } finally {
    process.env.PATH = savedPath
  }
}

/** Runs `fn` with `process.platform` overridden (restored in finally). */
async function withPlatform(platform: NodeJS.Platform, fn: () => Promise<void>): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
    writable: true,
  })
  try {
    await fn()
  } finally {
    Object.defineProperty(process, 'platform', original)
  }
}

/** Log files created by runWithRepaint for the iOS submit (spawn evidence). */
function iosSubmitLogFiles(): Set<string> {
  return new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('rn-firebase-ios-submit-')))
}

/** Reads the NUL-separated argv marker (or null if the fake xcrun never ran). */
function readXcrunArgv(argvFile: string): string[] | null {
  if (!existsSync(argvFile)) return null
  return readFileSync(argvFile, 'utf8')
    .split('\0')
    .filter((arg) => arg !== '')
}

describe('runLocalIosSubmit (integration)', () => {
  test('non-macOS platform → IosSubmitPrecheckError with the macOS message, no spawn', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-ios-nomac-'))
    const argvFile = join(root, 'xcrun-argv')
    const binDir = await makeFakeXcrun(argvFile)

    let spawned: boolean | null = null
    try {
      await withPlatform('linux', async () => {
        await withPrependedPath(binDir, async () => {
          await assert.rejects(
            () => runLocalIosSubmit({ artifactPath: 'build/ios/app.ipa', profile: 'production' }),
            (err: unknown) => {
              assert.ok(err instanceof IosSubmitPrecheckError)
              assert.equal(err.code, 'IOS_SUBMIT_PRECHECK_FAILED')
              assert.equal(err.issues.nonMacOs, true)
              assert.ok(err.message.includes('macOS'))
              assert.ok(err.message.includes('altool is macOS-only'))
              return true
            }
          )
        })
      })
      // Check the marker BEFORE the cleanup below deletes the directory.
      spawned = existsSync(argvFile)
    } finally {
      await rm(binDir, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
    }

    // No spawn: the fake xcrun was never invoked → no argv marker.
    assert.equal(spawned, false)
  })

  test('missing xcrun + missing credentials → setup report, no spawn', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'rfc-ios-empty-'))
    const emptyHome = await mkdtemp(join(tmpdir(), 'rfc-ios-empty-home-'))
    const savedCwd = process.cwd()
    const savedPath = process.env.PATH
    const savedHome = process.env.HOME
    const savedAsc = saveAscEnv()
    const logsBefore = iosSubmitLogFiles()

    process.chdir(emptyDir)
    process.env.PATH = emptyDir // no xcrun anywhere on PATH
    process.env.HOME = emptyHome // no keys anywhere under HOME
    for (const key of ASC_ENV_KEYS) delete process.env[key]

    try {
      await withPlatform('darwin', async () => {
        await assert.rejects(
          () => runLocalIosSubmit({ artifactPath: 'build/ios/app.ipa', profile: 'production' }),
          (err: unknown) => {
            assert.ok(err instanceof IosSubmitPrecheckError)
            assert.equal(err.code, 'IOS_SUBMIT_PRECHECK_FAILED')
            assert.equal(err.issues.missingXcrun, true)
            assert.equal(err.issues.missingCredentials, true)
            const message = err.message
            assert.ok(message.includes('xcrun'))
            assert.ok(message.includes('Generate API Key'))
            assert.ok(message.includes('one-time download'))
            assert.ok(message.includes('ASC_APPLE_ID'))
            return true
          }
        )
      })
    } finally {
      process.chdir(savedCwd)
      process.env.PATH = savedPath
      restoreEnvVar('HOME', savedHome)
      restoreAscEnv(savedAsc)
      await rm(emptyDir, { recursive: true, force: true })
      await rm(emptyHome, { recursive: true, force: true })
    }

    // No spawn: no new rn-firebase-ios-submit log file appeared.
    for (const log of iosSubmitLogFiles()) {
      assert.ok(logsBefore.has(log), `unexpected new log file ${log} — a spawn occurred`)
    }
  })

  test('missing credentials (xcrun present) → setup report, no spawn', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-ios-nocred-'))
    const argvFile = join(root, 'xcrun-argv')
    const binDir = await makeFakeXcrun(argvFile)
    const emptyHome = await mkdtemp(join(tmpdir(), 'rfc-ios-nocred-home-'))
    const savedCwd = process.cwd()
    const savedHome = process.env.HOME
    const savedAsc = saveAscEnv()

    process.chdir(root) // no ./private_keys here
    process.env.HOME = emptyHome // no keys under HOME
    for (const key of ASC_ENV_KEYS) delete process.env[key]

    let spawned: boolean | null = null
    try {
      await withPlatform('darwin', async () => {
        await withPrependedPath(binDir, async () => {
          await assert.rejects(
            () => runLocalIosSubmit({ artifactPath: 'build/ios/app.ipa', profile: 'production' }),
            (err: unknown) => {
              assert.ok(err instanceof IosSubmitPrecheckError)
              assert.equal(err.code, 'IOS_SUBMIT_PRECHECK_FAILED')
              assert.equal(err.issues.missingCredentials, true)
              assert.ok(err.message.includes('Generate API Key'))
              return true
            }
          )
        })
      })
      // Check the marker BEFORE the cleanup below deletes the directory.
      spawned = existsSync(argvFile)
    } finally {
      process.chdir(savedCwd)
      restoreEnvVar('HOME', savedHome)
      restoreAscEnv(savedAsc)
      await rm(binDir, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
      await rm(emptyHome, { recursive: true, force: true })
    }

    // No spawn: the fake xcrun was never invoked → no argv marker.
    assert.equal(spawned, false)
  })

  test('success: ASC API key credentials → spawns xcrun altool with the exact arg array', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-ios-ok-'))
    const argvFile = join(root, 'xcrun-argv')
    const binDir = await makeFakeXcrun(argvFile)
    const savedCwd = process.cwd()
    const savedAsc = saveAscEnv()

    // Credentials: ASC API key in ./private_keys.
    await mkdir(join(root, 'private_keys'), { recursive: true })
    await writeFile(join(root, 'private_keys', 'AuthKey_TESTKEY.p8'), 'key')

    let argv: string[] | null = null
    let expectedP8Path: string | null = null
    process.chdir(root)
    process.env.ASC_API_KEY_ID = 'TESTKEY'
    process.env.ASC_API_ISSUER_ID = 'TESTISS'
    for (const key of ['ASC_APPLE_ID', 'ASC_APP_PASSWORD', 'API_PRIVATE_KEYS_DIR'] as const) {
      delete process.env[key]
    }

    const origLog = console.log
    const origClear = console.clear
    console.log = () => {}
    console.clear = () => {}

    try {
      await withPlatform('darwin', async () => {
        await withPrependedPath(binDir, async () => {
          await runLocalIosSubmit({
            artifactPath: 'build/ios/app-1.0.0-prod-dev.ipa',
            profile: 'production',
          })
        })
      })
      // Read the marker BEFORE the cleanup below deletes the directory.
      argv = readXcrunArgv(argvFile)
      // process.cwd() is canonicalized (e.g. /private/var/... on macOS).
      expectedP8Path = join(process.cwd(), 'private_keys', 'AuthKey_TESTKEY.p8')
    } finally {
      console.log = origLog
      console.clear = origClear
      process.chdir(savedCwd)
      restoreAscEnv(savedAsc)
      await rm(binDir, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
    }

    assert.ok(argv !== null, 'expected the fake xcrun to have been spawned')
    assert.deepEqual(argv, [
      'altool',
      '--upload-app',
      '-f',
      'build/ios/app-1.0.0-prod-dev.ipa',
      '-t',
      'ios',
      '--apiKey',
      expectedP8Path,
      '--apiIssuer',
      'TESTISS',
    ])
  })

  test('success: app-specific password credentials → spawns xcrun altool with -u/-p', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-ios-ok-apple-'))
    const argvFile = join(root, 'xcrun-argv')
    const binDir = await makeFakeXcrun(argvFile)
    const emptyHome = await mkdtemp(join(tmpdir(), 'rfc-ios-ok-apple-home-'))
    const savedCwd = process.cwd()
    const savedHome = process.env.HOME
    const savedAsc = saveAscEnv()

    let argv: string[] | null = null
    process.chdir(root) // no ./private_keys here
    process.env.HOME = emptyHome // no keys under HOME
    for (const key of ASC_ENV_KEYS) delete process.env[key]
    process.env.ASC_APPLE_ID = 'dev@example.com'
    process.env.ASC_APP_PASSWORD = 'applwpw1'

    const origLog = console.log
    const origClear = console.clear
    console.log = () => {}
    console.clear = () => {}

    try {
      await withPlatform('darwin', async () => {
        await withPrependedPath(binDir, async () => {
          await runLocalIosSubmit({ artifactPath: 'build/ios/app.ipa', profile: 'preview' })
        })
      })
      // Read the marker BEFORE the cleanup below deletes the directory.
      argv = readXcrunArgv(argvFile)
    } finally {
      console.log = origLog
      console.clear = origClear
      process.chdir(savedCwd)
      restoreEnvVar('HOME', savedHome)
      restoreAscEnv(savedAsc)
      await rm(binDir, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
      await rm(emptyHome, { recursive: true, force: true })
    }

    assert.ok(argv !== null, 'expected the fake xcrun to have been spawned')
    assert.deepEqual(argv, [
      'altool',
      '--upload-app',
      '-f',
      'build/ios/app.ipa',
      '-t',
      'ios',
      '-u',
      'dev@example.com',
      '-p',
      'applwpw1',
    ])
  })

  test('spawn failure: non-zero altool exit → IosSubmitSpawnError with exit code + log path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-ios-fail-'))
    const argvFile = join(root, 'xcrun-argv')
    const binDir = await makeFakeXcrun(argvFile, 3) // fake xcrun exits 3
    const emptyHome = await mkdtemp(join(tmpdir(), 'rfc-ios-fail-home-'))
    const savedCwd = process.cwd()
    const savedHome = process.env.HOME
    const savedAsc = saveAscEnv()

    process.chdir(root)
    process.env.HOME = emptyHome
    for (const key of ASC_ENV_KEYS) delete process.env[key]
    process.env.ASC_APPLE_ID = 'dev@example.com'
    process.env.ASC_APP_PASSWORD = 'applwpw1'

    const origLog = console.log
    const origClear = console.clear
    console.log = () => {}
    console.clear = () => {}

    try {
      await withPlatform('darwin', async () => {
        await withPrependedPath(binDir, async () => {
          await assert.rejects(
            () => runLocalIosSubmit({ artifactPath: 'build/ios/app.ipa', profile: 'production' }),
            (err: unknown) => {
              assert.ok(err instanceof IosSubmitSpawnError)
              assert.equal(err.code, 'IOS_SUBMIT_SPAWN_FAILED')
              assert.equal(err.exitCode, 3)
              assert.ok(err.logFilePath.endsWith('.log'))
              assert.ok(existsSync(err.logFilePath))
              return true
            }
          )
        })
      })
    } finally {
      console.log = origLog
      console.clear = origClear
      process.chdir(savedCwd)
      restoreEnvVar('HOME', savedHome)
      restoreAscEnv(savedAsc)
      await rm(binDir, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
      await rm(emptyHome, { recursive: true, force: true })
    }
  })
})

describe('runLocalSubmit (seam wiring)', () => {
  test('android dispatches to the real executor (pre-check error, not not-implemented)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-seam-android-'))
    const savedCwd = process.cwd()
    const savedAndroid: Record<string, string | undefined> = {}
    for (const key of ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'GOOGLE_PLAY_TRACK', 'APP_ENV']) {
      savedAndroid[key] = process.env[key]
    }
    for (const key of Object.keys(savedAndroid)) delete process.env[key]

    process.chdir(root) // no app.json, no gradle, no creds → pre-check fails

    try {
      await assert.rejects(
        () =>
          runLocalSubmit({
            platform: 'android',
            artifactPath: 'build/android/app.aab',
            profile: 'production',
          }),
        (err: unknown) => {
          // The android branch reached the real executor (its pre-check
          // error, not the old LocalSubmitNotImplementedError).
          assert.ok(err instanceof AndroidSubmitPrecheckError)
          assert.ok(!(err instanceof LocalSubmitNotImplementedError))
          assert.equal(err.code, 'ANDROID_SUBMIT_PRECHECK_FAILED')
          assert.equal(err.issues.missingCredentials, true)
          return true
        }
      )
    } finally {
      process.chdir(savedCwd)
      for (const [key, value] of Object.entries(savedAndroid)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      await rm(root, { recursive: true, force: true })
    }
  })

  test('ios dispatches to the iOS executor (no longer not-implemented)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rfc-seam-'))
    const argvFile = join(root, 'xcrun-argv')
    const binDir = await makeFakeXcrun(argvFile)
    const emptyHome = await mkdtemp(join(tmpdir(), 'rfc-seam-home-'))
    const savedCwd = process.cwd()
    const savedHome = process.env.HOME
    const savedAsc = saveAscEnv()

    process.chdir(root) // no ./private_keys here
    process.env.HOME = emptyHome // no keys under HOME
    for (const key of ASC_ENV_KEYS) delete process.env[key]

    let spawned: boolean | null = null
    try {
      await withPlatform('darwin', async () => {
        await withPrependedPath(binDir, async () => {
          await assert.rejects(
            () =>
              runLocalSubmit({
                platform: 'ios',
                artifactPath: 'build/ios/app.ipa',
                profile: 'production',
              }),
            (err: unknown) => {
              // The ios branch reached the real executor (its pre-check
              // error, not the old LocalSubmitNotImplementedError).
              assert.ok(err instanceof IosSubmitPrecheckError)
              assert.ok(!(err instanceof LocalSubmitNotImplementedError))
              assert.equal(err.code, 'IOS_SUBMIT_PRECHECK_FAILED')
              assert.equal(err.issues.missingCredentials, true)
              return true
            }
          )
        })
      })
      // Check the marker BEFORE the cleanup below deletes the directory.
      spawned = existsSync(argvFile)
    } finally {
      process.chdir(savedCwd)
      restoreEnvVar('HOME', savedHome)
      restoreAscEnv(savedAsc)
      await rm(binDir, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
      await rm(emptyHome, { recursive: true, force: true })
    }

    // No spawn: the pre-check failed before any spawn.
    assert.equal(spawned, false)
  })
})
