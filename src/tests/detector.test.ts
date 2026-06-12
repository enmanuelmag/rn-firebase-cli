import assert from 'node:assert/strict'
import { after,before, describe, test } from 'node:test'
import { mkdir, mkdtemp, rm,writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { detectConfigExtension } from '../core/detector/config-ext.js'
import { detectProjectType } from '../core/detector/index.js'

describe('detectProjectType', () => {
  let tmpDir: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rfc-test-'))
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('returns expo when app.json has expo key', async () => {
    const dir = join(tmpDir, 'expo-appjson')
    await mkdir(dir)
    await writeFile(join(dir, 'app.json'), JSON.stringify({ expo: { name: 'MyApp' } }))
    assert.equal(detectProjectType(dir), 'expo')
  })

  test('returns expo when app.config.js exists', async () => {
    const dir = join(tmpDir, 'expo-configjs')
    await mkdir(dir)
    await writeFile(join(dir, 'app.config.js'), 'module.exports = {}')
    assert.equal(detectProjectType(dir), 'expo')
  })

  test('returns expo when app.config.ts exists', async () => {
    const dir = join(tmpDir, 'expo-configts')
    await mkdir(dir)
    await writeFile(join(dir, 'app.config.ts'), 'export default {}')
    assert.equal(detectProjectType(dir), 'expo')
  })

  test('returns bare when android/ exists', async () => {
    const dir = join(tmpDir, 'bare-android')
    await mkdir(dir)
    await mkdir(join(dir, 'android'))
    assert.equal(detectProjectType(dir), 'bare')
  })

  test('returns bare when ios/ exists', async () => {
    const dir = join(tmpDir, 'bare-ios')
    await mkdir(dir)
    await mkdir(join(dir, 'ios'))
    assert.equal(detectProjectType(dir), 'bare')
  })

  test('returns null when no identifiers found', async () => {
    const dir = join(tmpDir, 'empty')
    await mkdir(dir)
    assert.equal(detectProjectType(dir), null)
  })
})

describe('detectConfigExtension', () => {
  let tmpDir: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rfc-ext-'))
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('returns ts when tsconfig.json exists', async () => {
    const dir = join(tmpDir, 'ts')
    await mkdir(dir)
    await writeFile(join(dir, 'tsconfig.json'), '{}')
    assert.equal(detectConfigExtension(dir), 'ts')
  })

  test('returns mjs when package.json has type module', async () => {
    const dir = join(tmpDir, 'esm')
    await mkdir(dir)
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
    assert.equal(detectConfigExtension(dir), 'mjs')
  })

  test('returns mjs as fallback', async () => {
    const dir = join(tmpDir, 'fallback')
    await mkdir(dir)
    assert.equal(detectConfigExtension(dir), 'mjs')
  })

  test('ts takes priority over package.json type=module', async () => {
    const dir = join(tmpDir, 'ts-priority')
    await mkdir(dir)
    await writeFile(join(dir, 'tsconfig.json'), '{}')
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
    assert.equal(detectConfigExtension(dir), 'ts')
  })
})
