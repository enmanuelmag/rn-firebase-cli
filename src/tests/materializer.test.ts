import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { applyConfigDefaults } from '../core/config/defaults.js'
import { BareRNMaterializer } from '../core/materializer/bare-rn.js'
import {
  buildNativeConfigFilename,
  cleanAppJsonGoogleServicesFile,
  ExpoMaterializer,
} from '../core/materializer/expo.js'
import { getMaterializer } from '../core/materializer/index.js'

import type { FirebaseEnv, MaterializeParams } from '../types.js'

const sampleEnv: FirebaseEnv = {
  name: 'dev',
  googleCloudProjectId: 'my-project',
  android: { packageName: 'com.myapp' },
  ios: { bundleId: 'com.myapp' },
}

describe('ExpoMaterializer', () => {
  let tmpDir: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rfc-mat-'))
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  let origLog: typeof console.log

  beforeEach(() => {
    origLog = console.log
    console.log = () => {}
  })

  afterEach(() => {
    console.log = origLog
  })

  test('detectBundleIds reads from app.json', async () => {
    const dir = join(tmpDir, 'expo-detect')
    await mkdir(dir)
    await writeFile(
      join(dir, 'app.json'),
      JSON.stringify({
        expo: {
          android: { package: 'com.example' },
          ios: { bundleIdentifier: 'com.example.ios' },
        },
      })
    )
    const mat = new ExpoMaterializer()
    const ids = await mat.detectBundleIds(dir)
    assert.equal(ids.android, 'com.example')
    assert.equal(ids.ios, 'com.example.ios')
  })

  test('detectBundleIds returns empty for missing app.json', async () => {
    const dir = join(tmpDir, 'expo-empty')
    await mkdir(dir)
    const mat = new ExpoMaterializer()
    const ids = await mat.detectBundleIds(dir)
    assert.deepEqual(ids, {})
  })

  test('updateGitignore appends outDir', async () => {
    const dir = join(tmpDir, 'gitignore-append')
    await mkdir(dir)
    await writeFile(join(dir, '.gitignore'), 'node_modules/\n')
    const mat = new ExpoMaterializer()
    await mat.updateGitignore(dir, 'keys')
    const content = await readFile(join(dir, '.gitignore'), 'utf-8')
    assert.ok(content.includes('keys/'))
  })

  test('updateGitignore does not duplicate entry', async () => {
    const dir = join(tmpDir, 'gitignore-nodup')
    await mkdir(dir)
    await writeFile(join(dir, '.gitignore'), 'node_modules/\nkeys/\n')
    const mat = new ExpoMaterializer()
    await mat.updateGitignore(dir, 'keys')
    const content = await readFile(join(dir, '.gitignore'), 'utf-8')
    const occurrences = content.split('keys/').length - 1
    assert.equal(occurrences, 1)
  })

  test('updateGitignore creates .gitignore if missing', async () => {
    const dir = join(tmpDir, 'gitignore-create')
    await mkdir(dir)
    const mat = new ExpoMaterializer()
    await mat.updateGitignore(dir, 'keys')
    const content = await readFile(join(dir, '.gitignore'), 'utf-8')
    assert.ok(content.includes('keys/'))
  })

  test('buildNativeConfigFilename returns prefixed name', () => {
    assert.equal(
      buildNativeConfigFilename('dev', 'com.myapp', 'google-services.json'),
      'dev-com.myapp-google-services.json'
    )
    assert.equal(
      buildNativeConfigFilename('prod', 'com.myapp', 'GoogleService-Info.plist'),
      'prod-com.myapp-GoogleService-Info.plist'
    )
  })

  test('writeConfigFiles writes prefixed android file', async () => {
    const dir = join(tmpDir, 'write-config-prefixed')
    await mkdir(dir)
    const mat = new ExpoMaterializer()
    const config = applyConfigDefaults({ platform: 'both', outDir: 'keys', envs: [sampleEnv] })
    const params: MaterializeParams = {
      cwd: dir,
      config,
      env: sampleEnv,
      androidConfigRaw: '{"mock":"android"}',
      iosConfigRaw: '<?xml version="1.0"?><plist/>',
      configExt: 'ts',
    }
    await mat.writeConfigFiles(params)
    const { existsSync: fsExistsSync } = await import('fs')
    assert.ok(fsExistsSync(join(dir, 'keys', 'dev-com.myapp-google-services.json')))
    assert.ok(fsExistsSync(join(dir, 'keys', 'dev-com.myapp-GoogleService-Info.plist')))
  })

  test('updateAppConfig sets prefixed path in app.json', async () => {
    const dir = join(tmpDir, 'update-app-config-prefixed')
    await mkdir(dir)
    await writeFile(
      join(dir, 'app.json'),
      JSON.stringify({ expo: { name: 'TestApp', slug: 'test-app' } })
    )
    const mat = new ExpoMaterializer()
    const config = applyConfigDefaults({ platform: 'both', outDir: 'keys', envs: [sampleEnv] })
    const params: MaterializeParams = {
      cwd: dir,
      config,
      env: sampleEnv,
      configExt: 'ts',
    }
    await mat.updateAppConfig(params)
    const updated = JSON.parse(await readFile(join(dir, 'app.json'), 'utf-8')) as {
      expo: { android: { googleServicesFile: string }; ios: { googleServicesFile: string } }
    }
    assert.ok(
      updated.expo.android.googleServicesFile.includes('dev-com.myapp-google-services.json')
    )
    assert.ok(
      updated.expo.ios.googleServicesFile.includes('dev-com.myapp-GoogleService-Info.plist')
    )
  })

  test('writeFirebaseConfig writes to src/config/ when src/ exists', async () => {
    const dir = join(tmpDir, 'firebase-config-src')
    await mkdir(dir)
    await mkdir(join(dir, 'src'))
    const mat = new ExpoMaterializer()
    const config = applyConfigDefaults({ platform: 'both', envs: [sampleEnv] })
    const params: MaterializeParams = {
      cwd: dir,
      config,
      env: sampleEnv,
      configExt: 'ts',
    }
    await mat.writeFirebaseConfig(params)
    const written = await readFile(join(dir, 'src', 'config', 'firebase.config.ts'), 'utf-8')
    assert.ok(written.length > 0)
  })

  test('writeFirebaseConfig writes to config/ when src/ does not exist', async () => {
    const dir = join(tmpDir, 'firebase-config-root')
    await mkdir(dir)
    const mat = new ExpoMaterializer()
    const config = applyConfigDefaults({ platform: 'both', envs: [sampleEnv] })
    const params: MaterializeParams = {
      cwd: dir,
      config,
      env: sampleEnv,
      configExt: 'ts',
    }
    await mat.writeFirebaseConfig(params)
    const written = await readFile(join(dir, 'config', 'firebase.config.ts'), 'utf-8')
    assert.ok(written.length > 0)
  })

  test('cleanAppJsonGoogleServicesFile removes googleServicesFile from android and ios', async () => {
    const dir = join(tmpDir, 'clean-both')
    await mkdir(dir)
    await writeFile(
      join(dir, 'app.json'),
      JSON.stringify({
        expo: {
          name: 'TestApp',
          android: {
            package: 'com.example',
            googleServicesFile: './keys/dev-google-services.json',
          },
          ios: {
            bundleIdentifier: 'com.example',
            googleServicesFile: './keys/dev-GoogleService-Info.plist',
          },
        },
      })
    )
    const result = await cleanAppJsonGoogleServicesFile(dir)
    assert.equal(result, true)
    const updated = JSON.parse(await readFile(join(dir, 'app.json'), 'utf-8')) as {
      expo: {
        android?: { googleServicesFile?: string; package?: string }
        ios?: { googleServicesFile?: string; bundleIdentifier?: string }
      }
    }
    assert.equal(updated.expo.android?.googleServicesFile, undefined)
    assert.equal(updated.expo.ios?.googleServicesFile, undefined)
    // Other fields on android/ios should be preserved
    assert.equal(updated.expo.android?.package, 'com.example')
    assert.equal(updated.expo.ios?.bundleIdentifier, 'com.example')
  })

  test('cleanAppJsonGoogleServicesFile removes empty android/ios blocks', async () => {
    const dir = join(tmpDir, 'clean-empty-blocks')
    await mkdir(dir)
    await writeFile(
      join(dir, 'app.json'),
      JSON.stringify({
        expo: {
          name: 'TestApp',
          android: { googleServicesFile: './keys/dev-google-services.json' },
          ios: { googleServicesFile: './keys/dev-GoogleService-Info.plist' },
        },
      })
    )
    const result = await cleanAppJsonGoogleServicesFile(dir)
    assert.equal(result, true)
    const updated = JSON.parse(await readFile(join(dir, 'app.json'), 'utf-8')) as {
      expo: { android?: unknown; ios?: unknown }
    }
    assert.equal(updated.expo.android, undefined)
    assert.equal(updated.expo.ios, undefined)
  })

  test('cleanAppJsonGoogleServicesFile returns false when no googleServicesFile present', async () => {
    const dir = join(tmpDir, 'clean-no-op')
    await mkdir(dir)
    const originalContent = JSON.stringify({
      expo: {
        name: 'TestApp',
        android: { package: 'com.example' },
        ios: { bundleIdentifier: 'com.example' },
      },
    })
    await writeFile(join(dir, 'app.json'), originalContent)
    const result = await cleanAppJsonGoogleServicesFile(dir)
    assert.equal(result, false)
    // File should be unchanged
    const content = await readFile(join(dir, 'app.json'), 'utf-8')
    assert.deepEqual(JSON.parse(content), JSON.parse(originalContent))
  })
})

describe('BareRNMaterializer', () => {
  let origLog: typeof console.log

  beforeEach(() => {
    origLog = console.log
    console.log = () => {}
  })

  afterEach(() => {
    console.log = origLog
  })

  test('build does not throw', async () => {
    const mat = new BareRNMaterializer()
    const config = applyConfigDefaults({ platform: 'both', envs: [sampleEnv] })
    const params: MaterializeParams = {
      cwd: tmpdir(),
      config,
      env: sampleEnv,
      configExt: 'mjs',
    }
    await assert.doesNotReject(() => mat.build(params))
  })

  test('writeConfigFiles does not throw', async () => {
    const mat = new BareRNMaterializer()
    const config = applyConfigDefaults({ platform: 'both', envs: [sampleEnv] })
    await assert.doesNotReject(() =>
      mat.writeConfigFiles({ cwd: tmpdir(), config, env: sampleEnv, configExt: 'mjs' })
    )
  })
})

describe('getMaterializer factory', () => {
  test('returns ExpoMaterializer for expo', () => {
    assert.ok(getMaterializer('expo') instanceof ExpoMaterializer)
  })

  test('returns BareRNMaterializer for bare', () => {
    assert.ok(getMaterializer('bare') instanceof BareRNMaterializer)
  })
})
