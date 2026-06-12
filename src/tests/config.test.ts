import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { applyConfigDefaults } from '../core/config/defaults.js'
import { configCjs, configMjs, configTs } from '../core/config/templates.js'
import { extractWebClientId } from '../core/firebase/web-client.js'

import type { FirebaseEnv } from '../types.js'

const sampleEnv: FirebaseEnv = {
  name: 'dev',
  googleCloudProjectId: 'my-project-dev',
  firebaseProjectId: 'my-project-dev',
  android: { packageName: 'com.myapp' },
  ios: { bundleId: 'com.myapp' },
}

describe('applyConfigDefaults', () => {
  test('sets default outDir to keys', () => {
    const cfg = applyConfigDefaults({ platform: 'both', envs: [sampleEnv] })
    assert.equal(cfg.outDir, 'keys')
  })

  test('respects custom outDir', () => {
    const cfg = applyConfigDefaults({
      platform: 'android',
      outDir: 'firebase-keys',
      envs: [sampleEnv],
    })
    assert.equal(cfg.outDir, 'firebase-keys')
  })

  test('preserves platform', () => {
    const cfg = applyConfigDefaults({ platform: 'ios', envs: [sampleEnv] })
    assert.equal(cfg.platform, 'ios')
  })

  test('preserves envs array', () => {
    const cfg = applyConfigDefaults({ platform: 'both', envs: [sampleEnv] })
    assert.equal(cfg.envs.length, 1)
    assert.equal(cfg.envs[0].name, 'dev')
  })
})

describe('config templates', () => {
  const cfg = applyConfigDefaults({ platform: 'both', envs: [sampleEnv] })

  test('configTs contains satisfies RNFConfig', () => {
    const out = configTs(cfg)
    assert.ok(out.includes('satisfies RNFConfig'))
    assert.ok(out.includes('import type { RNFConfig }'))
  })

  test('configMjs contains export default', () => {
    const out = configMjs(cfg)
    assert.ok(out.includes('export default'))
  })

  test('configCjs contains module.exports', () => {
    const out = configCjs(cfg)
    assert.ok(out.includes('module.exports'))
  })

  test('all templates include auto-generated comment', () => {
    assert.ok(configTs(cfg).includes('Auto-generated'))
    assert.ok(configMjs(cfg).includes('Auto-generated'))
    assert.ok(configCjs(cfg).includes('Auto-generated'))
  })
})

describe('extractWebClientId', () => {
  test('extracts web client id from valid google-services.json', () => {
    const json = JSON.stringify({
      client: [
        {
          oauth_client: [
            { client_type: 1, client_id: 'android-client-id' },
            { client_type: 3, client_id: 'web-client-id.apps.googleusercontent.com' },
          ],
        },
      ],
    })
    assert.equal(extractWebClientId(json), 'web-client-id.apps.googleusercontent.com')
  })

  test('returns undefined if no web client', () => {
    const json = JSON.stringify({
      client: [{ oauth_client: [{ client_type: 1, client_id: 'android-only' }] }],
    })
    assert.equal(extractWebClientId(json), undefined)
  })

  test('returns undefined for invalid json', () => {
    assert.equal(extractWebClientId('not-json'), undefined)
  })
})
