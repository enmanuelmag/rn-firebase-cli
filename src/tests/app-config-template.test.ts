import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { generateAppConfigTs } from '../core/config/app-config-template.js'

describe('generateAppConfigTs', () => {
  const sampleEnv = {
    name: 'dev',
    android: { packageName: 'com.myapp' },
    ios: { bundleId: 'com.myapp' },
  }

  test('contains ExpoConfig import', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'both' })
    assert.ok(out.includes("import type { ExpoConfig } from 'expo/config'"))
  })

  test('contains appJsonData import', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'both' })
    assert.ok(out.includes("import appJsonData from './app.json'"))
  })

  test('contains prefixed android path', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'both' })
    assert.ok(out.includes('dev-com.myapp-google-services.json'))
  })

  test('contains prefixed ios path', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'both' })
    assert.ok(out.includes('dev-com.myapp-GoogleService-Info.plist'))
  })

  test('android-only omits ios key', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'android' })
    assert.ok(!out.includes('GoogleService-Info.plist'))
  })

  test('ios-only omits android key', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'ios' })
    assert.ok(!out.includes('google-services.json'))
  })

  test('multiple envs appear in firebaseFiles', () => {
    const envs = [
      { name: 'dev', android: { packageName: 'com.myapp' }, ios: { bundleId: 'com.myapp' } },
      { name: 'prod', android: { packageName: 'com.myapp' }, ios: { bundleId: 'com.myapp' } },
    ]
    const out = generateAppConfigTs({ envs, outDir: 'keys', platform: 'both' })
    assert.ok(out.includes('prod-com.myapp-google-services.json'))
    assert.ok(out.includes('dev-com.myapp-google-services.json'))
  })

  test('exports default config typed as ExpoConfig', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'both' })
    assert.ok(out.includes('const config = {'))
    assert.ok(out.includes('} as ExpoConfig'))
    assert.ok(out.includes('export default config'))
  })
})
