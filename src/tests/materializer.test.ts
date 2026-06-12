import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { applyConfigDefaults } from '../core/config/defaults.js'
import { BareRNMaterializer } from '../core/materializer/bare-rn.js'
import { ExpoMaterializer } from '../core/materializer/expo.js'
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
})

describe('BareRNMaterializer', () => {
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
