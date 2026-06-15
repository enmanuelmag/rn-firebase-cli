import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
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
    assert.match(scripts['ios:dev']!, /--ios/)
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
    assert.match(scripts['android:dev']!, /--android/)
  })

  test('injects ios + android + start scripts when platform is both', async () => {
    const dir = await mkdtemp(join(tmpDir, 'both-'))
    await writeFile(join(dir, 'package.json'), makePkg())

    await injectPackageScripts(dir, 'staging', 'both')

    const scripts = await readPkgScripts(dir)
    assert.ok('ios:staging' in scripts)
    assert.ok('android:staging' in scripts)
    assert.ok('start:staging' in scripts)
    assert.match(scripts['ios:staging']!, /--ios/)
    assert.match(scripts['android:staging']!, /--android/)
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
})
