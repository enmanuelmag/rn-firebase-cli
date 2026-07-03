import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'

import { runUpdateScripts } from '../commands/update-scripts.js'

function configMjs(platform: 'android' | 'ios' | 'both', envNames: string[]): string {
  const envs = envNames
    .map(
      (name) => `    {
      name: '${name}',
      googleCloudProjectId: 'proj',
      android: { packageName: 'com.myapp' },
      ios: { bundleId: 'com.myapp' },
    }`
    )
    .join(',\n')

  return `export default {
  platform: '${platform}',
  outDir: 'keys',
  envs: [
${envs}
  ],
}
`
}

async function readPkgScripts(dir: string): Promise<Record<string, string>> {
  const raw = await readFile(join(dir, 'package.json'), 'utf8')
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
  return pkg.scripts ?? {}
}

describe('runUpdateScripts', () => {
  let tmpRoot: string
  let origCwd: string
  let origLog: typeof console.log
  let origError: typeof console.error

  before(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'rfc-update-scripts-'))
  })

  after(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  beforeEach(() => {
    origCwd = process.cwd()
    origLog = console.log
    origError = console.error
    console.log = () => {}
    console.error = () => {}
  })

  afterEach(() => {
    process.chdir(origCwd)
    console.log = origLog
    console.error = origError
  })

  test('generates ios/android scripts including --clean-if-changed by default', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'both-'))
    await writeFile(join(dir, 'rn-firebase.config.mjs'), configMjs('both', ['dev']))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: {} }, null, 2) + '\n'
    )

    process.chdir(dir)
    await runUpdateScripts()

    const scripts = await readPkgScripts(dir)
    assert.match(scripts['ios:dev']!, /^rn-firebase sync/)
    assert.match(scripts['ios:dev']!, /--clean-if-changed/)
    assert.match(scripts['android:dev']!, /^rn-firebase sync/)
    assert.match(scripts['android:dev']!, /--clean-if-changed/)
  })

  test('skips scripts that already start with "rn-firebase sync" (idempotent)', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'skip-'))
    await writeFile(join(dir, 'rn-firebase.config.mjs'), configMjs('android', ['dev']))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'app',
          scripts: {
            'android:dev': 'rn-firebase sync --env dev --clean-if-changed && expo run:android',
          },
        },
        null,
        2
      ) + '\n'
    )

    process.chdir(dir)
    await runUpdateScripts()

    const scripts = await readPkgScripts(dir)
    assert.equal(
      scripts['android:dev'],
      'rn-firebase sync --env dev --clean-if-changed && expo run:android',
      'existing up-to-date script should be left untouched'
    )
  })

  test('overwrites custom scripts that do not start with "rn-firebase sync"', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'overwrite-'))
    await writeFile(join(dir, 'rn-firebase.config.mjs'), configMjs('android', ['dev']))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: { 'android:dev': 'expo run:android' } }, null, 2) +
        '\n'
    )

    process.chdir(dir)
    await runUpdateScripts()

    const scripts = await readPkgScripts(dir)
    assert.match(scripts['android:dev']!, /--clean-if-changed/)
  })

  test('generates build/eas-update scripts per platform', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'build-both-'))
    // Explicit Expo fixture — build:/eas-update: scripts are Expo-only (task 25).
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(join(dir, 'rn-firebase.config.mjs'), configMjs('both', ['dev']))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: {} }, null, 2) + '\n'
    )

    process.chdir(dir)
    await runUpdateScripts()

    const scripts = await readPkgScripts(dir)
    assert.match(
      scripts['build:dev:ios']!,
      /^rn-firebase build --platform ios --env dev --profile production$/
    )
    assert.match(
      scripts['build:dev:ios:submit']!,
      /^rn-firebase build --platform ios --env dev --profile production --submit$/
    )
    assert.match(
      scripts['build:dev:android']!,
      /^rn-firebase build --platform android --env dev --profile production$/
    )
    assert.match(
      scripts['build:dev:android:submit']!,
      /^rn-firebase build --platform android --env dev --profile production --submit$/
    )
    assert.match(scripts['eas-update:dev']!, /^rn-firebase eas-update --profile dev$/)
    assert.ok(
      !scripts['eas-update:dev']!.includes('-m'),
      'eas-update script must not include -m/--message'
    )
  })

  test('only generates build scripts for the configured platform', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'build-ios-only-'))
    // Explicit Expo fixture — build:/eas-update: scripts are Expo-only (task 25).
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(join(dir, 'rn-firebase.config.mjs'), configMjs('ios', ['dev']))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: {} }, null, 2) + '\n'
    )

    process.chdir(dir)
    await runUpdateScripts()

    const scripts = await readPkgScripts(dir)
    assert.ok('build:dev:ios' in scripts, 'ios build script should be generated')
    assert.ok(!('build:dev:android' in scripts), 'android build script should not be generated')
  })

  test('skips build scripts that already start with "rn-firebase build" (idempotent)', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'build-skip-'))
    // Explicit Expo fixture — build:/eas-update: scripts are Expo-only (task 25).
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(join(dir, 'rn-firebase.config.mjs'), configMjs('ios', ['dev']))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'app',
          scripts: {
            'build:dev:ios': 'rn-firebase build --platform ios --env dev --profile custom',
          },
        },
        null,
        2
      ) + '\n'
    )

    process.chdir(dir)
    await runUpdateScripts()

    const scripts = await readPkgScripts(dir)
    assert.equal(
      scripts['build:dev:ios'],
      'rn-firebase build --platform ios --env dev --profile custom',
      'existing rn-firebase build script should be left untouched (treated as already up to date)'
    )
  })

  test('overwrites user-customized build scripts that do not start with "rn-firebase build"', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'build-custom-'))
    // Explicit Expo fixture — build:/eas-update: scripts are Expo-only (task 25).
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(join(dir, 'rn-firebase.config.mjs'), configMjs('ios', ['dev']))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'app',
          scripts: { 'build:dev:ios': 'echo "my custom build script"' },
        },
        null,
        2
      ) + '\n'
    )

    process.chdir(dir)
    await runUpdateScripts()

    const scripts = await readPkgScripts(dir)
    assert.equal(
      scripts['build:dev:ios'],
      'rn-firebase build --platform ios --env dev --profile production',
      'user-customized script (not prefixed with rn-firebase build) should be overwritten with the generated value'
    )
  })

  test('skips eas-update scripts that already start with "rn-firebase eas-update" (idempotent)', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'eas-update-skip-'))
    // Explicit Expo fixture — build:/eas-update: scripts are Expo-only (task 25).
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(join(dir, 'rn-firebase.config.mjs'), configMjs('ios', ['dev']))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'app',
          scripts: { 'eas-update:dev': 'rn-firebase eas-update --profile custom' },
        },
        null,
        2
      ) + '\n'
    )

    process.chdir(dir)
    await runUpdateScripts()

    const scripts = await readPkgScripts(dir)
    assert.equal(
      scripts['eas-update:dev'],
      'rn-firebase eas-update --profile custom',
      'existing rn-firebase eas-update script should be left untouched (treated as already up to date)'
    )
  })

  test('bare React Native project (android/ dir, no app.json) only generates ios/android scripts, no build/eas-update', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'bare-'))
    await mkdir(join(dir, 'android'))
    await writeFile(join(dir, 'rn-firebase.config.mjs'), configMjs('both', ['dev']))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: {} }, null, 2) + '\n'
    )

    const logs: string[] = []
    console.log = (msg?: unknown) => {
      logs.push(String(msg))
    }

    process.chdir(dir)
    await runUpdateScripts()

    const scripts = await readPkgScripts(dir)
    assert.ok('ios:dev' in scripts, 'ios script should still be generated')
    assert.ok('android:dev' in scripts, 'android script should still be generated')
    assert.ok(!('build:dev:ios' in scripts), 'build:ios script should not be generated')
    assert.ok(!('build:dev:android' in scripts), 'build:android script should not be generated')
    assert.ok(!('eas-update:dev' in scripts), 'eas-update script should not be generated')
    assert.ok(
      logs.some((l) => /Skipped build\/eas-update scripts/.test(l)),
      'expected an informational message explaining the skip'
    )
  })

  test('undetected project type (null — no app.json/android/ios) only generates ios/android scripts, no build/eas-update', async () => {
    const dir = await mkdtemp(join(tmpRoot, 'undetected-'))
    await writeFile(join(dir, 'rn-firebase.config.mjs'), configMjs('both', ['dev']))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: {} }, null, 2) + '\n'
    )

    const logs: string[] = []
    console.log = (msg?: unknown) => {
      logs.push(String(msg))
    }

    process.chdir(dir)
    await runUpdateScripts()

    const scripts = await readPkgScripts(dir)
    assert.ok('ios:dev' in scripts, 'ios script should still be generated')
    assert.ok('android:dev' in scripts, 'android script should still be generated')
    assert.ok(!('build:dev:ios' in scripts), 'build:ios script should not be generated')
    assert.ok(!('build:dev:android' in scripts), 'build:android script should not be generated')
    assert.ok(!('eas-update:dev' in scripts), 'eas-update script should not be generated')
    assert.ok(
      logs.some((l) => /Skipped build\/eas-update scripts/.test(l)),
      'expected an informational message explaining the skip'
    )
  })
})
