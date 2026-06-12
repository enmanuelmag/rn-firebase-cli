import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { existsSync } from 'fs'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  buildUsageHint,
  generateEnvContent,
  getEnvPrefix,
  getEnvVarName,
  parseFirebaseVarsFromAndroid,
  writeEnvFile,
} from '../utils/envFile.js'

// ---------------------------------------------------------------------------
// getEnvPrefix
// ---------------------------------------------------------------------------

describe('getEnvPrefix', () => {
  test('expo returns EXPO_PUBLIC_', () => {
    assert.equal(getEnvPrefix('expo'), 'EXPO_PUBLIC_')
  })

  test('bare returns empty string', () => {
    assert.equal(getEnvPrefix('bare'), '')
  })
})

// ---------------------------------------------------------------------------
// getEnvVarName
// ---------------------------------------------------------------------------

describe('getEnvVarName', () => {
  test('expo applies EXPO_PUBLIC_ prefix', () => {
    assert.equal(getEnvVarName('FIREBASE_API_KEY', 'expo'), 'EXPO_PUBLIC_FIREBASE_API_KEY')
  })

  test('bare applies no prefix', () => {
    assert.equal(getEnvVarName('FIREBASE_API_KEY', 'bare'), 'FIREBASE_API_KEY')
  })

  test('expo applies prefix to WEB_CLIENT_ID', () => {
    assert.equal(
      getEnvVarName('FIREBASE_WEB_CLIENT_ID', 'expo'),
      'EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID'
    )
  })
})

// ---------------------------------------------------------------------------
// generateEnvContent
// ---------------------------------------------------------------------------

describe('generateEnvContent', () => {
  test('expo — applies EXPO_PUBLIC_ prefix and generates KEY=VALUE lines', () => {
    const vars = {
      FIREBASE_API_KEY: 'abc123',
      FIREBASE_PROJECT_ID: 'my-project',
    }
    const result = generateEnvContent(vars, 'expo')
    assert.ok(result.includes('EXPO_PUBLIC_FIREBASE_API_KEY=abc123'))
    assert.ok(result.includes('EXPO_PUBLIC_FIREBASE_PROJECT_ID=my-project'))
  })

  test('bare — no prefix, generates KEY=VALUE lines', () => {
    const vars = {
      FIREBASE_API_KEY: 'abc123',
    }
    const result = generateEnvContent(vars, 'bare')
    assert.ok(result.includes('FIREBASE_API_KEY=abc123'))
    assert.ok(!result.includes('EXPO_PUBLIC_'))
  })

  test('omits lines with undefined values', () => {
    const vars: Record<string, string | undefined> = {
      FIREBASE_API_KEY: 'abc123',
      FIREBASE_WEB_CLIENT_ID: undefined,
    }
    const result = generateEnvContent(vars, 'expo')
    assert.ok(result.includes('EXPO_PUBLIC_FIREBASE_API_KEY=abc123'))
    assert.ok(!result.includes('FIREBASE_WEB_CLIENT_ID'))
  })

  test('omits lines with empty string values', () => {
    const vars: Record<string, string | undefined> = {
      FIREBASE_API_KEY: 'abc123',
      FIREBASE_PROJECT_ID: '',
    }
    const result = generateEnvContent(vars, 'expo')
    assert.ok(!result.includes('FIREBASE_PROJECT_ID='))
  })

  test('returns empty string when all values are undefined', () => {
    const vars: Record<string, string | undefined> = {
      FIREBASE_API_KEY: undefined,
    }
    const result = generateEnvContent(vars, 'expo')
    assert.equal(result, '')
  })

  test('output ends with newline when there are lines', () => {
    const vars = { FIREBASE_API_KEY: 'abc123' }
    const result = generateEnvContent(vars, 'expo')
    assert.ok(result.endsWith('\n'))
  })
})

// ---------------------------------------------------------------------------
// parseFirebaseVarsFromAndroid
// ---------------------------------------------------------------------------

const sampleGoogleServices = JSON.stringify({
  project_info: {
    project_number: '123456789',
    project_id: 'my-project-dev',
    storage_bucket: 'my-project-dev.appspot.com',
  },
  client: [
    {
      client_info: {
        mobilesdk_app_id: '1:123456789:android:abcdef',
      },
      api_key: [{ current_key: 'AIzaSyABCDEF' }],
      oauth_client: [
        { client_type: 1, client_id: 'android-client.apps.googleusercontent.com' },
        { client_type: 3, client_id: 'web-client.apps.googleusercontent.com' },
      ],
    },
  ],
})

describe('parseFirebaseVarsFromAndroid', () => {
  test('extracts API_KEY', () => {
    const vars = parseFirebaseVarsFromAndroid(sampleGoogleServices)
    assert.equal(vars['FIREBASE_API_KEY'], 'AIzaSyABCDEF')
  })

  test('extracts PROJECT_ID', () => {
    const vars = parseFirebaseVarsFromAndroid(sampleGoogleServices)
    assert.equal(vars['FIREBASE_PROJECT_ID'], 'my-project-dev')
  })

  test('extracts STORAGE_BUCKET', () => {
    const vars = parseFirebaseVarsFromAndroid(sampleGoogleServices)
    assert.equal(vars['FIREBASE_STORAGE_BUCKET'], 'my-project-dev.appspot.com')
  })

  test('extracts APP_ID', () => {
    const vars = parseFirebaseVarsFromAndroid(sampleGoogleServices)
    assert.equal(vars['FIREBASE_APP_ID'], '1:123456789:android:abcdef')
  })

  test('extracts MESSAGING_SENDER_ID from project_number', () => {
    const vars = parseFirebaseVarsFromAndroid(sampleGoogleServices)
    assert.equal(vars['FIREBASE_MESSAGING_SENDER_ID'], '123456789')
  })

  test('derives AUTH_DOMAIN from project_id', () => {
    const vars = parseFirebaseVarsFromAndroid(sampleGoogleServices)
    assert.equal(vars['FIREBASE_AUTH_DOMAIN'], 'my-project-dev.firebaseapp.com')
  })

  test('extracts WEB_CLIENT_ID (client_type === 3)', () => {
    const vars = parseFirebaseVarsFromAndroid(sampleGoogleServices)
    assert.equal(vars['FIREBASE_WEB_CLIENT_ID'], 'web-client.apps.googleusercontent.com')
  })

  test('returns empty object for invalid JSON', () => {
    const vars = parseFirebaseVarsFromAndroid('not-json')
    assert.deepEqual(vars, {})
  })

  test('omits WEB_CLIENT_ID when no oauth_client with type 3', () => {
    const noWeb = JSON.stringify({
      project_info: { project_id: 'test', project_number: '1', storage_bucket: 'test.appspot.com' },
      client: [
        {
          client_info: { mobilesdk_app_id: '1:1:android:abc' },
          api_key: [{ current_key: 'key' }],
          oauth_client: [{ client_type: 1, client_id: 'android-client' }],
        },
      ],
    })
    const vars = parseFirebaseVarsFromAndroid(noWeb)
    assert.equal(vars['FIREBASE_WEB_CLIENT_ID'], undefined)
    assert.ok(!('FIREBASE_WEB_CLIENT_ID' in vars))
  })
})

// ---------------------------------------------------------------------------
// buildUsageHint
// ---------------------------------------------------------------------------

describe('buildUsageHint', () => {
  test('expo — output contains EXPO_PUBLIC_FIREBASE_ references', () => {
    const hint = buildUsageHint('expo', 'development')
    assert.ok(hint.includes('process.env.EXPO_PUBLIC_FIREBASE_'))
    assert.ok(hint.includes('.env.development'))
  })

  test('bare — output contains react-native-config import and Config.FIREBASE_ references', () => {
    const hint = buildUsageHint('bare', 'staging')
    assert.ok(hint.includes(`import Config from 'react-native-config'`))
    assert.ok(hint.includes('Config.FIREBASE_'))
    assert.ok(hint.includes('.env.staging'))
  })

  test('expo — output does not contain react-native-config', () => {
    const hint = buildUsageHint('expo', 'prod')
    assert.ok(!hint.includes('react-native-config'))
  })

  test('bare — output does not contain EXPO_PUBLIC_', () => {
    const hint = buildUsageHint('bare', 'prod')
    assert.ok(!hint.includes('EXPO_PUBLIC_'))
  })
})

// ---------------------------------------------------------------------------
// writeEnvFile
// ---------------------------------------------------------------------------

describe('writeEnvFile', () => {
  let tmpDir: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rfc-env-'))
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('creates .env.{envName} with given content', async () => {
    const dir = join(tmpDir, 'write-new')
    await import('fs/promises').then((fs) => fs.mkdir(dir))
    const content = 'EXPO_PUBLIC_FIREBASE_API_KEY=abc123\n'
    await writeEnvFile(dir, 'dev', content)
    const written = await readFile(join(dir, '.env.dev'), 'utf-8')
    assert.equal(written, content)
  })

  test('does not prompt when file does not exist', async () => {
    const dir = join(tmpDir, 'write-no-prompt')
    await import('fs/promises').then((fs) => fs.mkdir(dir))
    await assert.doesNotReject(() => writeEnvFile(dir, 'staging', 'KEY=VALUE\n'))
    assert.ok(existsSync(join(dir, '.env.staging')))
  })

  test('skips overwrite silently when existing content is identical', async () => {
    const dir = join(tmpDir, 'write-identical')
    await import('fs/promises').then((fs) => fs.mkdir(dir))
    const content = 'KEY=VALUE\n'
    await writeFile(join(dir, '.env.prod'), content)
    // writeEnvFile should not throw (no prompt because content is the same)
    await assert.doesNotReject(() => writeEnvFile(dir, 'prod', content))
  })
})
