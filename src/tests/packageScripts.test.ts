import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { injectPackageScripts } from '../utils/packageScripts.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePkg(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ name: 'test-app', scripts: {}, ...extra }, null, 2) + '\n'
}

async function readPkgScripts(dir: string): Promise<Record<string, string>> {
  const raw = await readFile(join(dir, 'package.json'), 'utf8')
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
  return pkg.scripts ?? {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('injectPackageScripts', () => {
  let tmpDir: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rfc-pkg-scripts-'))
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('injects ios + start scripts when platform is ios', async () => {
    const dir = await mkdtemp(join(tmpDir, 'ios-'))
    await writeFile(join(dir, 'package.json'), makePkg())

    await injectPackageScripts(dir, 'dev', 'ios')

    const scripts = await readPkgScripts(dir)
    assert.ok('ios:dev' in scripts, 'ios:dev script should be injected')
    assert.ok('start:dev' in scripts, 'start:dev script should be injected')
    assert.ok(!('android:dev' in scripts), 'android:dev should not be injected for ios platform')
    assert.match(scripts['ios:dev']!, /run:ios/)
    assert.match(scripts['ios:dev']!, /--clean-if-changed/)
    assert.match(scripts['start:dev']!, /APP_ENV=dev/)
  })

  test('injects android + start scripts when platform is android', async () => {
    const dir = await mkdtemp(join(tmpDir, 'android-'))
    await writeFile(join(dir, 'package.json'), makePkg())

    await injectPackageScripts(dir, 'dev', 'android')

    const scripts = await readPkgScripts(dir)
    assert.ok('android:dev' in scripts, 'android:dev script should be injected')
    assert.ok('start:dev' in scripts, 'start:dev script should be injected')
    assert.ok(!('ios:dev' in scripts), 'ios:dev should not be injected for android platform')
    assert.match(scripts['android:dev']!, /run:android/)
    assert.match(scripts['android:dev']!, /--clean-if-changed/)
  })

  test('injects ios + android + start scripts when platform is both', async () => {
    const dir = await mkdtemp(join(tmpDir, 'both-'))
    await writeFile(join(dir, 'package.json'), makePkg())

    await injectPackageScripts(dir, 'staging', 'both')

    const scripts = await readPkgScripts(dir)
    assert.ok('ios:staging' in scripts)
    assert.ok('android:staging' in scripts)
    assert.ok('start:staging' in scripts)
    assert.match(scripts['ios:staging']!, /run:ios/)
    assert.match(scripts['ios:staging']!, /--clean-if-changed/)
    assert.match(scripts['android:staging']!, /run:android/)
    assert.match(scripts['android:staging']!, /--clean-if-changed/)
    assert.match(scripts['start:staging']!, /APP_ENV=staging/)
  })

  test('skips existing scripts without overwriting them', async () => {
    const dir = await mkdtemp(join(tmpDir, 'skip-'))
    await writeFile(
      join(dir, 'package.json'),
      makePkg({ scripts: { 'ios:dev': 'CUSTOM_EXISTING_SCRIPT' } })
    )

    await injectPackageScripts(dir, 'dev', 'ios')

    const scripts = await readPkgScripts(dir)
    assert.equal(
      scripts['ios:dev'],
      'CUSTOM_EXISTING_SCRIPT',
      'existing script must not be overwritten'
    )
    assert.ok('start:dev' in scripts, 'start:dev should still be injected')
  })

  test('warns when dotenv-cli is missing', async () => {
    const dir = await mkdtemp(join(tmpDir, 'warn-'))
    await writeFile(join(dir, 'package.json'), makePkg())

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => {
      warnings.push(msg)
    }

    try {
      await injectPackageScripts(dir, 'dev', 'ios')
    } finally {
      console.warn = originalWarn
    }

    assert.ok(warnings.length > 0, 'should have printed a warning')
    assert.ok(
      warnings.some((w) => w.includes('dotenv-cli')),
      'warning should mention dotenv-cli'
    )
  })

  test('does not warn when dotenv-cli is in devDependencies', async () => {
    const dir = await mkdtemp(join(tmpDir, 'no-warn-dev-'))
    await writeFile(
      join(dir, 'package.json'),
      makePkg({ devDependencies: { 'dotenv-cli': '^7.0.0' } })
    )

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => {
      warnings.push(msg)
    }

    try {
      await injectPackageScripts(dir, 'dev', 'ios')
    } finally {
      console.warn = originalWarn
    }

    assert.ok(
      !warnings.some((w) => w.includes('dotenv')),
      'should not warn when dotenv is present in devDependencies'
    )
  })

  test('does not warn when dotenv is in dependencies', async () => {
    const dir = await mkdtemp(join(tmpDir, 'no-warn-deps-'))
    await writeFile(
      join(dir, 'package.json'),
      makePkg({ dependencies: { 'dotenv-cli': '^7.0.0' } })
    )

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (msg: string) => {
      warnings.push(msg)
    }

    try {
      await injectPackageScripts(dir, 'dev', 'ios')
    } finally {
      console.warn = originalWarn
    }

    assert.ok(
      !warnings.some((w) => w.includes('dotenv')),
      'should not warn when dotenv is present in dependencies'
    )
  })

  test('skips silently when package.json is missing', async () => {
    const dir = await mkdtemp(join(tmpDir, 'missing-'))
    // No package.json written

    // Should not throw
    await assert.doesNotReject(async () => {
      await injectPackageScripts(dir, 'dev', 'ios')
    })
  })

  test('injects build/eas-update scripts for ios platform', async () => {
    const dir = await mkdtemp(join(tmpDir, 'build-ios-'))
    // Explicit Expo fixture — build:/eas-update: scripts are Expo-only (task 25).
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(join(dir, 'package.json'), makePkg())

    await injectPackageScripts(dir, 'dev', 'ios')

    const scripts = await readPkgScripts(dir)
    assert.equal(
      scripts['build:dev:ios'],
      'rn-firebase build --platform ios --env dev --profile production'
    )
    assert.equal(
      scripts['build:dev:ios:submit'],
      'rn-firebase build --platform ios --env dev --profile production --submit'
    )
    assert.equal(
      scripts['build:dev:ios:submit:local'],
      'rn-firebase build --platform ios --env dev --profile production --submit --submit-mode local'
    )
    assert.ok(
      !('build:dev:android' in scripts),
      'android build script should not be injected for ios platform'
    )
    assert.ok(
      !('build:dev:android:submit:local' in scripts),
      'android local submit script should not be injected for ios platform'
    )
    assert.equal(scripts['eas-update:dev'], 'rn-firebase eas-update --profile dev')
    assert.ok(
      !scripts['eas-update:dev']!.includes('-m'),
      'eas-update script must not include -m/--message'
    )
  })

  test('injects build scripts for android platform', async () => {
    const dir = await mkdtemp(join(tmpDir, 'build-android-'))
    // Explicit Expo fixture — build:/eas-update: scripts are Expo-only (task 25).
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(join(dir, 'package.json'), makePkg())

    await injectPackageScripts(dir, 'dev', 'android')

    const scripts = await readPkgScripts(dir)
    assert.equal(
      scripts['build:dev:android'],
      'rn-firebase build --platform android --env dev --profile production'
    )
    assert.equal(
      scripts['build:dev:android:submit'],
      'rn-firebase build --platform android --env dev --profile production --submit'
    )
    assert.equal(
      scripts['build:dev:android:submit:local'],
      'rn-firebase build --platform android --env dev --profile production --submit --submit-mode local'
    )
    assert.ok(
      !('build:dev:ios' in scripts),
      'ios build script should not be injected for android platform'
    )
    assert.ok(
      !('build:dev:ios:submit:local' in scripts),
      'ios local submit script should not be injected for android platform'
    )
  })

  test('injects both ios and android build scripts when platform is both', async () => {
    const dir = await mkdtemp(join(tmpDir, 'build-both-'))
    // Explicit Expo fixture — build:/eas-update: scripts are Expo-only (task 25).
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(join(dir, 'package.json'), makePkg())

    await injectPackageScripts(dir, 'staging', 'both')

    const scripts = await readPkgScripts(dir)
    assert.ok('build:staging:ios' in scripts)
    assert.ok('build:staging:ios:submit' in scripts)
    assert.ok('build:staging:ios:submit:local' in scripts)
    assert.ok('build:staging:android' in scripts)
    assert.ok('build:staging:android:submit' in scripts)
    assert.ok('build:staging:android:submit:local' in scripts)
    assert.ok('eas-update:staging' in scripts)
  })

  test('does not overwrite existing build/eas-update scripts', async () => {
    const dir = await mkdtemp(join(tmpDir, 'build-skip-'))
    // Explicit Expo fixture — build:/eas-update: scripts are Expo-only (task 25).
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: {} }))
    await writeFile(
      join(dir, 'package.json'),
      makePkg({
        scripts: {
          'build:dev:ios': 'CUSTOM_BUILD_SCRIPT',
          'eas-update:dev': 'CUSTOM_EAS_UPDATE_SCRIPT',
        },
      })
    )

    await injectPackageScripts(dir, 'dev', 'ios')

    const scripts = await readPkgScripts(dir)
    assert.equal(
      scripts['build:dev:ios'],
      'CUSTOM_BUILD_SCRIPT',
      'existing script must not be overwritten'
    )
    assert.equal(
      scripts['eas-update:dev'],
      'CUSTOM_EAS_UPDATE_SCRIPT',
      'existing script must not be overwritten'
    )
    assert.ok('build:dev:ios:submit' in scripts, 'build:dev:ios:submit should still be injected')
    assert.ok(
      'build:dev:ios:submit:local' in scripts,
      'build:dev:ios:submit:local should still be injected'
    )
  })

  test('bare React Native project (android/ dir, no app.json) only injects ios/android/start, no build/eas-update', async () => {
    const dir = await mkdtemp(join(tmpDir, 'bare-'))
    await mkdir(join(dir, 'android'))
    await writeFile(join(dir, 'package.json'), makePkg())

    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => {
      logs.push(msg)
    }

    try {
      await injectPackageScripts(dir, 'dev', 'both')
    } finally {
      console.log = originalLog
    }

    const scripts = await readPkgScripts(dir)
    assert.ok('ios:dev' in scripts, 'ios script should still be injected')
    assert.ok('android:dev' in scripts, 'android script should still be injected')
    assert.ok('start:dev' in scripts, 'start script should still be injected')
    assert.ok(!('build:dev:ios' in scripts), 'build:ios script should not be injected')
    assert.ok(!('build:dev:android' in scripts), 'build:android script should not be injected')
    assert.ok(
      !('build:dev:ios:submit:local' in scripts),
      'build:ios:submit:local script should not be injected'
    )
    assert.ok(
      !('build:dev:android:submit:local' in scripts),
      'build:android:submit:local script should not be injected'
    )
    assert.ok(!('eas-update:dev' in scripts), 'eas-update script should not be injected')
    assert.ok(
      logs.some((l) => l.includes('Skipped build/eas-update scripts')),
      'expected an informational message explaining the skip'
    )
  })

  test('undetected project type (null — no app.json/android/ios) only injects ios/android/start, no build/eas-update', async () => {
    const dir = await mkdtemp(join(tmpDir, 'undetected-'))
    await writeFile(join(dir, 'package.json'), makePkg())

    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => {
      logs.push(msg)
    }

    try {
      await injectPackageScripts(dir, 'dev', 'both')
    } finally {
      console.log = originalLog
    }

    const scripts = await readPkgScripts(dir)
    assert.ok('ios:dev' in scripts, 'ios script should still be injected')
    assert.ok('android:dev' in scripts, 'android script should still be injected')
    assert.ok('start:dev' in scripts, 'start script should still be injected')
    assert.ok(!('build:dev:ios' in scripts), 'build:ios script should not be injected')
    assert.ok(!('build:dev:android' in scripts), 'build:android script should not be injected')
    assert.ok(
      !('build:dev:ios:submit:local' in scripts),
      'build:ios:submit:local script should not be injected'
    )
    assert.ok(
      !('build:dev:android:submit:local' in scripts),
      'build:android:submit:local script should not be injected'
    )
    assert.ok(!('eas-update:dev' in scripts), 'eas-update script should not be injected')
    assert.ok(
      logs.some((l) => l.includes('Skipped build/eas-update scripts')),
      'expected an informational message explaining the skip'
    )
  })
})
