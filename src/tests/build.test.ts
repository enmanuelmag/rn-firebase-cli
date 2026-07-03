import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  splitOutputLines,
} from '../core/helpers/build-run.js'
import {
  addBuiltVersion,
  buildVersionKey,
  hasBuiltVersion,
  readBuiltVersions,
  resolveAppVersion,
  writeBuiltVersions,
} from '../core/helpers/built-versions.js'

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
      '--local',
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
