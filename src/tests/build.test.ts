import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'

import {
  buildEasBuildArgs,
  buildEasSubmitArgs,
  buildEasUpdateArgs,
  formatFailureTail,
  renderHeader,
  renderTail,
  resolveArtifactOutput,
  runWithRepaint,
  splitOutputLines,
} from '../core/helpers/build-run.js'
import {
  addBuiltVersion,
  buildVersionKey,
  hasBuiltVersion,
  readBuiltVersions,
  resolveAppName,
  resolveAppVersion,
  writeBuiltVersions,
} from '../core/helpers/built-versions.js'
import { LocalSubmitNotImplementedError, runLocalSubmit } from '../core/submit/index.js'
import { IosSubmitPrecheckError } from '../core/submit/ios.js'

// ---------------------------------------------------------------------------
// Pure command-array builders
// ---------------------------------------------------------------------------

describe('buildEasBuildArgs', () => {
  test('builds an eas build --local command array', () => {
    const args = buildEasBuildArgs({ platform: 'android', profile: 'production', output: 'build' })
    assert.deepEqual(args, [
      'build',
      '--platform',
      'android',
      '--profile',
      'production',
      '--local',
      '--output',
      'build',
      '--non-interactive',
    ])
  })

  test('never includes --local/--remote as a user-facing toggle (always local)', () => {
    const args = buildEasBuildArgs({ platform: 'all', profile: 'preview', output: 'out' })
    assert.ok(args.includes('--local'))
    assert.ok(!args.includes('--remote'))
  })
})

describe('buildEasSubmitArgs', () => {
  test('builds an eas submit --local command array by default', () => {
    const args = buildEasSubmitArgs({ platform: 'ios', profile: 'production', output: 'build' })
    assert.deepEqual(args, [
      'submit',
      '--platform',
      'ios',
      '--profile',
      'production',
      '--path',
      'build',
      '--non-interactive',
    ])
  })

  test('uses --latest when binaryVersion is "latest"', () => {
    const args = buildEasSubmitArgs({
      platform: 'ios',
      profile: 'production',
      output: 'build',
      binaryVersion: 'latest',
    })
    assert.ok(args.includes('--latest'))
    assert.ok(!args.includes('--path'))
    assert.ok(!args.includes('--local'))
  })

  test('uses --id <version> when binaryVersion is a specific value', () => {
    const args = buildEasSubmitArgs({
      platform: 'ios',
      profile: 'production',
      output: 'build',
      binaryVersion: 'abc-123',
    })
    const idIndex = args.indexOf('--id')
    assert.ok(idIndex !== -1)
    assert.equal(args[idIndex + 1], 'abc-123')
  })
})

describe('buildEasUpdateArgs', () => {
  test('defaults branch to the profile value', () => {
    const args = buildEasUpdateArgs({ branch: 'production', message: 'fix crash' })
    assert.deepEqual(args, [
      'update',
      '--branch',
      'production',
      '--message',
      'fix crash',
      '--non-interactive',
    ])
  })
})

describe('resolveArtifactOutput', () => {
  test('builds a scoped, versioned .ipa path for ios', () => {
    const result = resolveArtifactOutput({
      baseOutput: 'build',
      platform: 'ios',
      appName: 'my-app',
      version: '1.2.3',
      profile: 'production',
      env: 'prod',
    })
    assert.equal(result, join('build', 'ios', 'my-app-1.2.3-production-prod.ipa'))
  })

  test('builds a scoped, versioned .aab path for android', () => {
    const result = resolveArtifactOutput({
      baseOutput: 'build',
      platform: 'android',
      appName: 'my-app',
      version: '1.2.3',
      profile: 'production',
      env: 'prod',
    })
    assert.equal(result, join('build', 'android', 'my-app-1.2.3-production-prod.aab'))
  })

  test('ios and android never share the same resolved path for identical inputs otherwise', () => {
    const shared = {
      baseOutput: 'build',
      appName: 'my-app',
      version: '1.0.0',
      profile: 'preview',
      env: 'staging',
    }
    const iosPath = resolveArtifactOutput({ ...shared, platform: 'ios' })
    const androidPath = resolveArtifactOutput({ ...shared, platform: 'android' })
    assert.notEqual(iosPath, androidPath)
    assert.match(iosPath, /^build[/\\]ios[/\\]/)
    assert.match(androidPath, /^build[/\\]android[/\\]/)
  })

  test('respects a custom baseOutput directory', () => {
    const result = resolveArtifactOutput({
      baseOutput: 'dist/artifacts',
      platform: 'ios',
      appName: 'app',
      version: '2.0.0',
      profile: 'production',
      env: 'dev',
    })
    assert.equal(result, join('dist/artifacts', 'ios', 'app-2.0.0-production-dev.ipa'))
  })
})

// ---------------------------------------------------------------------------
// Header / tail / failure-tail formatting (pure)
// ---------------------------------------------------------------------------

describe('renderHeader', () => {
  test('includes platform, profile, and env/file info', () => {
    const header = renderHeader({
      command: 'build',
      platform: 'android',
      profile: 'production',
      envName: 'dev',
      envFile: '.env.dev',
    })
    assert.match(header, /rn-firebase build/)
    assert.match(header, /android/)
    assert.match(header, /production/)
    assert.match(header, /dev/)
    assert.match(header, /\.env\.dev/)
  })

  test('omits env line when envName is not provided', () => {
    const header = renderHeader({ command: 'eas-update', platform: 'all', profile: 'production' })
    assert.doesNotMatch(header, /env:/)
  })
})

describe('splitOutputLines / renderTail', () => {
  test('splits on \\n and \\r, dropping a single trailing empty line', () => {
    const lines = splitOutputLines('line1\nline2\r\nline3\r')
    assert.deepEqual(lines, ['line1', 'line2', 'line3'])
  })

  test('renderTail returns only the last N lines', () => {
    const lines = ['a', 'b', 'c', 'd', 'e']
    assert.equal(renderTail(lines, 2), 'd\ne')
    assert.equal(renderTail(lines, 10), 'a\nb\nc\nd\ne')
  })
})

describe('formatFailureTail', () => {
  test('includes the exact failed command and the last 10 lines of output', () => {
    const combined = Array.from({ length: 15 }, (_, i) => `line-${i}`).join('\n')
    const formatted = formatFailureTail(['eas', 'build', '--platform', 'android'], combined, 10)
    assert.match(formatted, /Command failed: eas build --platform android/)
    assert.match(formatted, /line-14/)
    assert.doesNotMatch(formatted, /line-4\n/) // line-4 (index) should be outside the last 10 lines
  })
})

// ---------------------------------------------------------------------------
// Built-version dedup tracker
// ---------------------------------------------------------------------------

describe('built-versions dedup tracker', () => {
  let tmpRoot: string

  before(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'rfc-built-versions-'))
  })

  after(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  test('buildVersionKey composes "<version>:<platform>"', () => {
    assert.equal(buildVersionKey('1.0.0', 'android'), '1.0.0:android')
  })

  test('detects a first build as not previously built', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'first-'))
    const state = await readBuiltVersions(dir)
    assert.deepEqual(state.versions, [])
    assert.equal(hasBuiltVersion(state, '1.0.0', 'android'), false)
  })

  test('detects a duplicate build after it was recorded', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'dup-'))
    let state = await readBuiltVersions(dir)
    state = addBuiltVersion(state, '1.0.0', 'android')
    await writeBuiltVersions(dir, state)

    const reloaded = await readBuiltVersions(dir)
    assert.equal(hasBuiltVersion(reloaded, '1.0.0', 'android'), true)
    assert.equal(
      hasBuiltVersion(reloaded, '1.0.0', 'ios'),
      false,
      'platforms are tracked independently'
    )
  })

  test('written state file has no git side effects (no .git directory created/touched)', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'no-git-'))
    let state = await readBuiltVersions(dir)
    state = addBuiltVersion(state, '2.0.0', 'ios')
    await writeBuiltVersions(dir, state)

    assert.equal(existsSync(join(dir, '.git')), false, 'no .git directory should ever be created')
    const raw = await readFile(join(dir, '.rn-firebase', 'built-versions.json'), 'utf8')
    const parsed = JSON.parse(raw) as { versions: string[] }
    assert.deepEqual(parsed.versions, ['2.0.0:ios'])
  })

  test('resolveAppVersion prefers app.json expo.version over package.json version', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'resolve-app-json-'))
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: { version: '3.1.0' } }))
    await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '9.9.9' }))
    assert.equal(resolveAppVersion(dir), '3.1.0')
  })

  test('resolveAppVersion falls back to package.json version when app.json is missing', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'resolve-pkg-json-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '4.2.0' }))
    assert.equal(resolveAppVersion(dir), '4.2.0')
  })

  test('resolveAppVersion returns undefined (graceful skip) when neither file resolves a version', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'resolve-none-'))
    assert.equal(resolveAppVersion(dir), undefined)
  })

  test('resolveAppVersion tolerates malformed JSON without throwing', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'resolve-malformed-'))
    await writeFile(join(dir, 'app.json'), '{not valid json')
    await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }))
    assert.equal(resolveAppVersion(dir), '1.2.3')
  })

  test('resolveAppName reads name from package.json', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'appname-pkg-json-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'my-cool-app' }))
    assert.equal(resolveAppName(dir), 'my-cool-app')
  })

  test('resolveAppName falls back to "app" when package.json is missing', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'appname-missing-'))
    assert.equal(resolveAppName(dir), 'app')
  })

  test('resolveAppName falls back to "app" when package.json has no name field', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'appname-no-field-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }))
    assert.equal(resolveAppName(dir), 'app')
  })

  test('resolveAppName tolerates malformed JSON without throwing', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'appname-malformed-'))
    await writeFile(join(dir, 'package.json'), '{not valid json')
    assert.equal(resolveAppName(dir), 'app')
  })
})

// ---------------------------------------------------------------------------
// runBuild --env validation (spawn-free path only: invalid config/env exits
// before any eas/execa call is made)
// ---------------------------------------------------------------------------

describe('runBuild --env validation', () => {
  let tmpRoot: string
  let origCwd: string
  let origLog: typeof console.log
  let origError: typeof console.error
  let origAppEnv: string | undefined
  let origExit: typeof process.exit

  before(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'rfc-build-'))
  })

  after(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  beforeEach(() => {
    origCwd = process.cwd()
    origLog = console.log
    origError = console.error
    origAppEnv = process.env.APP_ENV
    origExit = process.exit
    console.log = () => {}
    console.error = () => {}
  })

  afterEach(() => {
    process.chdir(origCwd)
    console.log = origLog
    console.error = origError
    process.exit = origExit
    if (origAppEnv === undefined) {
      delete process.env.APP_ENV
    } else {
      process.env.APP_ENV = origAppEnv
    }
  })

  test('exits when rn-firebase.config is missing', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'no-config-'))
    process.chdir(dir)

    let exitCode: number | undefined
    process.exit = ((code?: number) => {
      exitCode = code
      throw new Error('process.exit called')
    }) as typeof process.exit

    const { runBuild } = await import('../commands/build.js')
    await assert.rejects(() => runBuild({ platform: 'all' }))
    assert.equal(exitCode, 1)
  })

  test('exits when --env does not match any configured environment', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'bad-env-'))
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(
      join(dir, 'rn-firebase.config.mjs'),
      `export default {
  platform: 'both',
  outDir: 'keys',
  envs: [{ name: 'dev', googleCloudProjectId: 'proj' }],
}
`
    )
    process.chdir(dir)

    let exitCode: number | undefined
    process.exit = ((code?: number) => {
      exitCode = code
      throw new Error('process.exit called')
    }) as typeof process.exit

    const { runBuild } = await import('../commands/build.js')
    await assert.rejects(() => runBuild({ platform: 'all', env: 'staging' }))
    assert.equal(exitCode, 1)
  })
})

// ---------------------------------------------------------------------------
// runBuild — Expo-only gate (bare/undetected React Native projects are
// blocked before any config loading or eas/execa invocation)
// ---------------------------------------------------------------------------

describe('runBuild — Expo-only project gate', () => {
  let tmpRoot: string
  let origCwd: string
  let origLog: typeof console.log
  let origError: typeof console.error
  let origExit: typeof process.exit

  before(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'rfc-build-gate-'))
  })

  after(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  beforeEach(() => {
    origCwd = process.cwd()
    origLog = console.log
    origError = console.error
    origExit = process.exit
  })

  afterEach(() => {
    process.chdir(origCwd)
    console.log = origLog
    console.error = origError
    process.exit = origExit
  })

  test('blocks bare React Native projects (android/ dir present, no app.json) before loadConfig', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'bare-'))
    await mkdir(join(dir, 'android'))
    process.chdir(dir)

    const errorMessages: string[] = []
    console.log = () => {}
    console.error = (msg?: unknown) => {
      errorMessages.push(String(msg))
    }

    let exitCode: number | undefined
    process.exit = ((code?: number) => {
      exitCode = code
      throw new Error('process.exit called')
    }) as typeof process.exit

    const { runBuild } = await import('../commands/build.js')
    await assert.rejects(() => runBuild({ platform: 'all' }))
    assert.equal(exitCode, 1)
    assert.ok(
      errorMessages.some((m) => /Expo/.test(m)),
      'expected an Expo-only guard message'
    )
  })

  test('blocks undetected project type (null — no app.json/android/ios) before loadConfig', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'undetected-'))
    process.chdir(dir)

    const errorMessages: string[] = []
    console.log = () => {}
    console.error = (msg?: unknown) => {
      errorMessages.push(String(msg))
    }

    let exitCode: number | undefined
    process.exit = ((code?: number) => {
      exitCode = code
      throw new Error('process.exit called')
    }) as typeof process.exit

    const { runBuild } = await import('../commands/build.js')
    await assert.rejects(() => runBuild({ platform: 'all' }))
    assert.equal(exitCode, 1)
    assert.ok(
      errorMessages.some((m) => /Expo/.test(m)),
      'expected an Expo-only guard message'
    )
  })

  test('does not block Expo projects — falls through to the config check instead', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'expo-'))
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    process.chdir(dir)

    const errorMessages: string[] = []
    console.log = () => {}
    console.error = (msg?: unknown) => {
      errorMessages.push(String(msg))
    }

    let exitCode: number | undefined
    process.exit = ((code?: number) => {
      exitCode = code
      throw new Error('process.exit called')
    }) as typeof process.exit

    const { runBuild } = await import('../commands/build.js')
    await assert.rejects(() => runBuild({ platform: 'all' }))
    assert.equal(exitCode, 1)
    assert.ok(
      errorMessages.some((m) => /No rn-firebase\.config found/.test(m)),
      'expected the guard to pass through to the missing-config error, not the Expo-only guard'
    )
  })
})

// ---------------------------------------------------------------------------
// runWithRepaint binary param — non-eas CLIs (e.g. xcrun) reuse the same
// header/rolling-tail/log-file rendering. The correctness-critical part is
// that the failure tail labels the REAL binary, not a hard-coded 'eas'.
// ---------------------------------------------------------------------------

describe('runWithRepaint binary param', () => {
  test('spawns the given binary and labels the failure tail with it (not eas)', async () => {
    const logLines: string[] = []
    const origLog = console.log
    const origClear = console.clear
    console.log = (msg?: unknown) => {
      logLines.push(String(msg))
    }
    console.clear = () => {}
    try {
      // A trivial failing command: node exits 3, producing no output. The
      // failure tail must label the real command (`node -e ...`), not `eas`.
      const result = await runWithRepaint({
        args: ['-e', 'process.exit(3)'],
        header: 'test header',
        logPrefix: 'rfc-test-binary',
        binary: 'node',
      })
      assert.equal(result.exitCode, 3)

      const failureLine = logLines.find((l) => /Command failed/.test(l))
      assert.ok(failureLine, 'expected a failure-tail line to be printed')
      assert.match(failureLine, /node -e process\.exit\(3\)/)
      assert.doesNotMatch(failureLine, /eas /, 'failure tail must not label the command as eas')
    } finally {
      console.log = origLog
      console.clear = origClear
    }
  })
})

// ---------------------------------------------------------------------------
// runLocalSubmit — the local (non-EAS) submit seam. iOS dispatches to the
// real `xcrun altool` executor (src/core/submit/ios.js); Android still
// throws a structured not-implemented error until the Google Play follow-up.
// ---------------------------------------------------------------------------

describe('runLocalSubmit — per-platform local submit', () => {
  test('ios dispatches to the real executor (pre-check error, not not-implemented)', async () => {
    // Scrub ASC credentials so the executor's pre-checks fail
    // deterministically (no real altool spawn, no network) — proof the ios
    // branch reaches the real executor instead of the old seam error.
    const savedAsc: Record<string, string | undefined> = {}
    for (const key of [
      'ASC_API_KEY_ID',
      'ASC_API_ISSUER_ID',
      'ASC_APPLE_ID',
      'ASC_APP_PASSWORD',
      'API_PRIVATE_KEYS_DIR',
    ]) {
      savedAsc[key] = process.env[key]
    }
    for (const key of Object.keys(savedAsc)) delete process.env[key]

    try {
      await assert.rejects(
        () => runLocalSubmit({ platform: 'ios', artifactPath: 'x.ipa', profile: 'production' }),
        (err: unknown) => {
          assert.ok(
            !(err instanceof LocalSubmitNotImplementedError),
            'ios must no longer throw LocalSubmitNotImplementedError'
          )
          assert.ok(
            err instanceof IosSubmitPrecheckError,
            'expected the iOS executor pre-check error'
          )
          assert.equal(err.code, 'IOS_SUBMIT_PRECHECK_FAILED')
          return true
        }
      )
    } finally {
      for (const [key, value] of Object.entries(savedAsc)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  test('rejects for android with a structured LocalSubmitNotImplementedError', async () => {
    await assert.rejects(
      () => runLocalSubmit({ platform: 'android', artifactPath: 'x.aab', profile: 'production' }),
      (err: unknown) => {
        assert.ok(
          err instanceof LocalSubmitNotImplementedError,
          'expected a LocalSubmitNotImplementedError'
        )
        assert.equal(err.code, 'LOCAL_SUBMIT_NOT_IMPLEMENTED')
        assert.equal(err.platform, 'android')
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// runBuild — local submit-mode. Covers the early --binary-version rejection
// in local mode, and the submit-mode threading (local seam vs. EAS path).
//
// The submit branch only runs after a successful build step, so these tests
// use a fake `eas` executable (a no-op shell script prepended to PATH) to let
// the build step "succeed" without a real EAS install. The default threading
// is tested at the runBuild level because directly exercising commander's
// .choices()/.default() would trigger program.parse() at cli.ts module load.
// ---------------------------------------------------------------------------

describe('runBuild — local submit-mode', () => {
  let tmpRoot: string
  let origCwd: string
  let origLog: typeof console.log
  let origError: typeof console.error
  let origExit: typeof process.exit
  let origPath: string | undefined
  let origExitCode: typeof process.exitCode

  before(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'rfc-local-submit-'))
  })

  after(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  beforeEach(() => {
    origCwd = process.cwd()
    origLog = console.log
    origError = console.error
    origExit = process.exit
    origPath = process.env.PATH
    origExitCode = process.exitCode
    process.exitCode = undefined
    console.log = () => {}
    console.error = () => {}
  })

  afterEach(() => {
    process.chdir(origCwd)
    console.log = origLog
    console.error = origError
    process.exit = origExit
    process.env.PATH = origPath
    process.exitCode = origExitCode
  })

  /** Creates a minimal Expo project (app.json + rn-firebase.config.mjs) in a temp dir. */
  async function makeExpoDir(subdir: string): Promise<string> {
    const dir = await mkdtemp(join(tmpRoot, subdir))
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(
      join(dir, 'rn-firebase.config.mjs'),
      `export default {
  platform: 'both',
  outDir: 'keys',
  envs: [{ name: 'dev', googleCloudProjectId: 'proj' }],
}
`
    )
    return dir
  }

  /** Runs `fn` with a no-op fake `eas` executable prepended to PATH. */
  async function withFakeEas(fn: () => Promise<void>): Promise<void> {
    const fakeBinDir = await mkdtemp(join(tmpdir(), 'rfc-fake-eas-'))
    const easPath = join(fakeBinDir, 'eas')
    await writeFile(easPath, '#!/bin/sh\nexit 0\n')
    await chmod(easPath, 0o755)
    const savedPath = process.env.PATH
    process.env.PATH = `${fakeBinDir}:${savedPath}`
    try {
      await fn()
    } finally {
      process.env.PATH = savedPath
      await rm(fakeBinDir, { recursive: true, force: true })
    }
  }

  test('rejects --binary-version in local mode (exits 1 with a clear message)', async () => {
    const dir = await makeExpoDir('local-binary-version-')
    process.chdir(dir)

    const errorMessages: string[] = []
    console.error = (msg?: unknown) => {
      errorMessages.push(String(msg))
    }

    let exitCode: number | undefined
    process.exit = ((code?: number) => {
      exitCode = code
      throw new Error('process.exit called')
    }) as typeof process.exit

    const { runBuild } = await import('../commands/build.js')
    await assert.rejects(() =>
      runBuild({ platform: 'ios', submitMode: 'local', binaryVersion: 'latest' })
    )
    assert.equal(exitCode, 1)
    assert.ok(
      errorMessages.some((m) => /--binary-version/.test(m) && /local/.test(m)),
      'expected a --binary-version + local rejection message'
    )
  })

  test('submitMode: "local" takes the local submit path (iOS pre-check failure is caught)', async () => {
    const dir = await makeExpoDir('local-seam-')
    process.chdir(dir)

    const errorMessages: string[] = []
    console.error = (msg?: unknown) => {
      errorMessages.push(String(msg))
    }

    // Scrub ASC credentials so the iOS executor fails its pre-checks
    // deterministically (no real altool spawn, no network).
    const savedAsc: Record<string, string | undefined> = {}
    for (const key of [
      'ASC_API_KEY_ID',
      'ASC_API_ISSUER_ID',
      'ASC_APPLE_ID',
      'ASC_APP_PASSWORD',
      'API_PRIVATE_KEYS_DIR',
    ]) {
      savedAsc[key] = process.env[key]
    }
    for (const key of Object.keys(savedAsc)) delete process.env[key]

    try {
      await withFakeEas(async () => {
        const { runBuild } = await import('../commands/build.js')
        // The iOS local submit runs the real executor; with no ASC
        // credentials it throws IosSubmitPrecheckError (English setup
        // report); runBuild catches it and converts it to a clean
        // non-zero exit (no unhandled rejection).
        await runBuild({ platform: 'ios', submit: true, submitMode: 'local' })
      })
    } finally {
      for (const [key, value] of Object.entries(savedAsc)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }

    assert.ok(
      errorMessages.some((m) => /Local iOS submit/.test(m)),
      'expected the local iOS submit pre-check message to be printed'
    )
    assert.equal(process.exitCode, 1, 'expected a non-zero exit code from the caught submit error')
  })

  test('submitMode omitted defaults to the EAS submit path (local seam not taken)', async () => {
    const dir = await makeExpoDir('eas-default-')
    process.chdir(dir)

    const logMessages: string[] = []
    const errorMessages: string[] = []
    console.log = (msg?: unknown) => {
      logMessages.push(String(msg))
    }
    console.error = (msg?: unknown) => {
      errorMessages.push(String(msg))
    }

    await withFakeEas(async () => {
      const { runBuild } = await import('../commands/build.js')
      // submitMode omitted → defaults to 'eas' → the EAS submit path runs
      // (fake eas submit exits 0 → "Submit completed successfully").
      await runBuild({ platform: 'ios', submit: true })
    })

    assert.ok(
      logMessages.some((m) => /Submit completed successfully/.test(m)),
      'expected the EAS submit success line'
    )
    assert.ok(
      !errorMessages.some((m) => /not implemented/.test(m)),
      'the local seam must not be taken when submitMode is omitted'
    )
  })
})
