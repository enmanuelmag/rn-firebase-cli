import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'

import { runSync } from '../commands/sync.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configMjs(params: {
  platform: 'android' | 'ios' | 'both'
  outDir: string
  envName: string
  packageName: string
  bundleId: string
}): string {
  return `export default {
  platform: '${params.platform}',
  outDir: '${params.outDir}',
  envs: [
    {
      name: '${params.envName}',
      googleCloudProjectId: 'proj',
      android: { packageName: '${params.packageName}' },
      ios: { bundleId: '${params.bundleId}' },
    },
  ],
}
`
}

async function setupProject(
  root: string,
  name: string,
  platform: 'android' | 'ios' | 'both'
): Promise<{
  dir: string
  androidSrc: string
  iosSrc: string
}> {
  const dir = await mkdtemp(join(root, `${name}-`))
  const outDir = 'keys'

  await mkdir(join(dir, outDir), { recursive: true })

  const androidSrc = join(dir, outDir, 'dev-com.myapp-google-services.json')
  const iosSrc = join(dir, outDir, 'dev-com.myapp-GoogleService-Info.plist')

  await writeFile(androidSrc, JSON.stringify({ v: 1 }))
  await writeFile(iosSrc, '<?xml version="1.0"?><plist><v>1</v></plist>')

  await writeFile(
    join(dir, 'rn-firebase.config.mjs'),
    configMjs({ platform, outDir, envName: 'dev', packageName: 'com.myapp', bundleId: 'com.myapp' })
  )

  return { dir, androidSrc, iosSrc }
}

async function readState(dir: string): Promise<{ android?: string; ios?: string }> {
  const raw = await readFile(join(dir, '.rn-firebase', 'env-state.json'), 'utf8')
  return JSON.parse(raw) as { android?: string; ios?: string }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runSync --clean-if-changed', () => {
  let tmpRoot: string
  let origCwd: string
  let origLog: typeof console.log
  let origWarn: typeof console.warn
  let origError: typeof console.error

  before(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'rfc-sync-'))
  })

  after(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  beforeEach(() => {
    origCwd = process.cwd()
    origLog = console.log
    origWarn = console.warn
    origError = console.error
    console.log = () => {}
    console.warn = () => {}
    console.error = () => {}
  })

  afterEach(() => {
    process.chdir(origCwd)
    console.log = origLog
    console.warn = origWarn
    console.error = origError
  })

  test('deletes android/ on first run (no stored hash) and persists the hash', async () => {
    const { dir } = await setupProject(tmpRoot, 'android-first', 'android')
    await mkdir(join(dir, 'android', 'app'), { recursive: true })
    await writeFile(join(dir, 'android', 'app', 'google-services.json'), JSON.stringify({ v: 0 }))

    process.chdir(dir)
    await runSync({ env: 'dev', cleanIfChanged: true })

    assert.equal(existsSync(join(dir, 'android')), false, 'android/ should be removed')
    const state = await readState(dir)
    assert.ok(state.android, 'android hash should be stored')
    assert.equal(state.ios, undefined)
  })

  test('does not delete android/ when the stored hash still matches the source', async () => {
    const { dir } = await setupProject(tmpRoot, 'android-match', 'android')
    await mkdir(join(dir, 'android', 'app'), { recursive: true })
    await writeFile(join(dir, 'android', 'app', 'google-services.json'), JSON.stringify({ v: 0 }))

    process.chdir(dir)
    // First run: no stored hash yet -> deletes android/ and stores the hash
    await runSync({ env: 'dev', cleanIfChanged: true })
    assert.equal(existsSync(join(dir, 'android')), false)

    // Simulate `expo prebuild` recreating the native folder
    await mkdir(join(dir, 'android', 'app'), { recursive: true })
    await writeFile(join(dir, 'android', 'app', 'marker.txt'), 'keep-me')

    // Second run: source unchanged -> must NOT delete android/ again
    await runSync({ env: 'dev', cleanIfChanged: true })

    assert.equal(existsSync(join(dir, 'android')), true, 'android/ should be preserved')
    assert.equal(
      existsSync(join(dir, 'android', 'app', 'marker.txt')),
      true,
      'existing native files should be untouched when hash matches'
    )
    assert.equal(
      existsSync(join(dir, 'android', 'app', 'google-services.json')),
      true,
      'falls back to in-place copy when hash matches'
    )
  })

  test('deletes android/ again once the source config content changes', async () => {
    const { dir, androidSrc } = await setupProject(tmpRoot, 'android-change', 'android')
    await mkdir(join(dir, 'android', 'app'), { recursive: true })
    await writeFile(join(dir, 'android', 'app', 'google-services.json'), JSON.stringify({ v: 0 }))

    process.chdir(dir)
    await runSync({ env: 'dev', cleanIfChanged: true })

    const firstState = await readState(dir)

    // Recreate native folder, then change the underlying source file
    await mkdir(join(dir, 'android', 'app'), { recursive: true })
    await writeFile(join(dir, 'android', 'app', 'marker.txt'), 'keep-me')
    await writeFile(androidSrc, JSON.stringify({ v: 2 }))

    await runSync({ env: 'dev', cleanIfChanged: true })

    assert.equal(existsSync(join(dir, 'android')), false, 'android/ should be removed again')
    const secondState = await readState(dir)
    assert.notEqual(secondState.android, firstState.android, 'stored hash should be updated')
  })

  test('deletes ios/ independently of android/ based on config.platform', async () => {
    const { dir, iosSrc } = await setupProject(tmpRoot, 'ios-independent', 'both')
    await mkdir(join(dir, 'android', 'app'), { recursive: true })
    await writeFile(join(dir, 'android', 'app', 'google-services.json'), JSON.stringify({ v: 0 }))
    await mkdir(join(dir, 'ios', 'App'), { recursive: true })
    await writeFile(
      join(dir, 'ios', 'App', 'GoogleService-Info.plist'),
      '<?xml version="1.0"?><plist><v>0</v></plist>'
    )

    process.chdir(dir)
    // First run establishes both hashes and cleans both folders (first run = no stored hash)
    await runSync({ env: 'dev', cleanIfChanged: true })
    assert.equal(existsSync(join(dir, 'android')), false)
    assert.equal(existsSync(join(dir, 'ios')), false)

    // Recreate both native folders
    await mkdir(join(dir, 'android', 'app'), { recursive: true })
    await writeFile(join(dir, 'android', 'app', 'marker.txt'), 'keep-me')
    await mkdir(join(dir, 'ios', 'App'), { recursive: true })
    await writeFile(join(dir, 'ios', 'App', 'marker.txt'), 'keep-me')

    // Only change the iOS source file — android hash still matches
    await writeFile(iosSrc, '<?xml version="1.0"?><plist><v>2</v></plist>')

    await runSync({ env: 'dev', cleanIfChanged: true })

    assert.equal(existsSync(join(dir, 'android')), true, 'android/ untouched when its hash matches')
    assert.equal(existsSync(join(dir, 'ios')), false, 'ios/ removed when its hash changed')
  })

  test('does not touch native folders when --clean-if-changed is not passed', async () => {
    const { dir } = await setupProject(tmpRoot, 'no-flag', 'android')
    await mkdir(join(dir, 'android', 'app'), { recursive: true })
    await writeFile(join(dir, 'android', 'app', 'google-services.json'), JSON.stringify({ v: 0 }))

    process.chdir(dir)
    await runSync({ env: 'dev' })

    assert.equal(existsSync(join(dir, 'android')), true, 'android/ must not be deleted by default')
    assert.equal(
      existsSync(join(dir, '.rn-firebase', 'env-state.json')),
      false,
      'state file should not be created when the flag is not passed'
    )
  })
})
