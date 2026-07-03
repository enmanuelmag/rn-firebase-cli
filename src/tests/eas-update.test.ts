import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'

import { runEasUpdate } from '../commands/eas-update.js'
import { buildEasUpdateArgs, checkProfileAgainstEasJson } from '../core/helpers/build-run.js'

describe('buildEasUpdateArgs (eas-update branch mapping)', () => {
  test('branch defaults to the profile value passed in', () => {
    const args = buildEasUpdateArgs({ branch: 'preview', message: 'hello' })
    const branchIndex = args.indexOf('--branch')
    assert.equal(args[branchIndex + 1], 'preview')
  })

  test('message is passed through verbatim', () => {
    const args = buildEasUpdateArgs({ branch: 'production', message: 'fix: crash on launch' })
    const messageIndex = args.indexOf('--message')
    assert.equal(args[messageIndex + 1], 'fix: crash on launch')
  })

  test('is a distinct command from the existing "update" command args', () => {
    const args = buildEasUpdateArgs({ branch: 'production', message: 'x' })
    assert.equal(args[0], 'update')
    // eas-update always runs `eas update`, never anything resembling
    // rn-firebase's own config-refresh `update` command.
    assert.ok(!args.includes('google-services'))
  })
})

describe('runEasUpdate --message validation', () => {
  let tmpRoot: string
  let origCwd: string
  let origLog: typeof console.log
  let origError: typeof console.error
  let origExit: typeof process.exit

  before(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'rfc-eas-update-'))
  })

  after(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  beforeEach(() => {
    origCwd = process.cwd()
    origLog = console.log
    origError = console.error
    origExit = process.exit
    console.log = () => {}
    console.error = () => {}
  })

  afterEach(() => {
    process.chdir(origCwd)
    console.log = origLog
    console.error = origError
    process.exit = origExit
  })

  test('exits with an error when -m/--message is missing', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'no-message-'))
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    process.chdir(dir)

    let exitCode: number | undefined
    process.exit = ((code?: number) => {
      exitCode = code
      throw new Error('process.exit called')
    }) as typeof process.exit

    await assert.rejects(() => runEasUpdate({ profile: 'production' }))
    assert.equal(exitCode, 1)
  })

  test('checkProfileAgainstEasJson returns a warning when profile is not an eas.json build profile', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'profile-warn-'))
    await writeFile(
      join(dir, 'eas.json'),
      JSON.stringify({ build: { production: {}, preview: {} } })
    )

    const warning = checkProfileAgainstEasJson(dir, 'nonexistent')
    assert.ok(warning, 'expected a warning to be returned')
    assert.match(warning!, /nonexistent/)
    assert.match(warning!, /not found/)
  })

  test('checkProfileAgainstEasJson returns undefined (no warning) when profile matches', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'profile-match-'))
    await writeFile(
      join(dir, 'eas.json'),
      JSON.stringify({ build: { production: {}, preview: {} } })
    )

    assert.equal(checkProfileAgainstEasJson(dir, 'production'), undefined)
  })

  test('checkProfileAgainstEasJson returns undefined when eas.json is missing', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'no-eas-json-'))
    assert.equal(checkProfileAgainstEasJson(dir, 'anything'), undefined)
  })

  test('checkProfileAgainstEasJson tolerates malformed eas.json without throwing', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'malformed-eas-json-'))
    await writeFile(join(dir, 'eas.json'), '{not valid json')
    assert.equal(checkProfileAgainstEasJson(dir, 'anything'), undefined)
  })
})

// ---------------------------------------------------------------------------
// runEasUpdate — Expo-only gate (bare/undetected React Native projects are
// blocked before the -m/--message check or any eas/execa invocation)
// ---------------------------------------------------------------------------

describe('runEasUpdate — Expo-only project gate', () => {
  let tmpRoot: string
  let origCwd: string
  let origLog: typeof console.log
  let origError: typeof console.error
  let origExit: typeof process.exit

  before(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'rfc-eas-update-gate-'))
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

  test('blocks bare React Native projects (android/ dir present, no app.json)', async () => {
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

    await assert.rejects(() => runEasUpdate({ profile: 'production', message: 'hello' }))
    assert.equal(exitCode, 1)
    assert.ok(
      errorMessages.some((m) => /Expo/.test(m)),
      'expected an Expo-only guard message'
    )
  })

  test('blocks undetected project type (null — no app.json/android/ios)', async () => {
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

    await assert.rejects(() => runEasUpdate({ profile: 'production', message: 'hello' }))
    assert.equal(exitCode, 1)
    assert.ok(
      errorMessages.some((m) => /Expo/.test(m)),
      'expected an Expo-only guard message'
    )
  })

  test('does not block Expo projects — falls through to the message-flag check instead', async () => {
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

    await assert.rejects(() => runEasUpdate({ profile: 'production' }))
    assert.equal(exitCode, 1)
    assert.ok(
      errorMessages.some((m) => /Missing required -m\/--message/.test(m)),
      'expected the guard to pass through to the missing-message error, not the Expo-only guard'
    )
  })
})
