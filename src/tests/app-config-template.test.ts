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

  test('contains ENV_COLORS color map', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'both' })
    assert.ok(out.includes('const ENV_COLORS: Record<string, string> ='))
  })

  test('contains console.log for active environment', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'both' })
    assert.ok(out.includes('console.log(`${envColor}[rn-firebase-cli] Active environment: ${env}\\x1b[0m`)'))
  })

  test('does not import chalk in generated output', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'both' })
    assert.ok(!out.includes('chalk'))
  })

  test('color map includes dev, staging, and prod colors', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'both' })
    assert.ok(out.includes("dev: '\\x1b[36m'"))
    assert.ok(out.includes("staging: '\\x1b[33m'"))
    assert.ok(out.includes("prod: '\\x1b[31m'"))
  })

  test('unknown env falls back to magenta default color', () => {
    const out = generateAppConfigTs({ envs: [sampleEnv], outDir: 'keys', platform: 'both' })
    assert.ok(out.includes("ENV_COLORS[env] ?? '\\x1b[35m'"))
  })
})
