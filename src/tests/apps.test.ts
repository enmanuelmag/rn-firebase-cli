import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createAndroidApp, createIOSApp } from '../core/firebase/apps.js'

// Fake execaFn helpers — match the ExecaFn signature: (cmd, args) => Promise<{ stdout }>

function fakeExecaSuccess(appId: string) {
  return async (_cmd: string, _args: string[]) => ({
    stdout: JSON.stringify({ result: { appId } }),
  })
}

function fakeExecaMissingAppId() {
  return async (_cmd: string, _args: string[]) => ({
    stdout: JSON.stringify({ result: {} }),
  })
}

function fakeExecaThrows(message: string) {
  return async (_cmd: string, _args: string[]): Promise<{ stdout: string }> => {
    throw new Error(message)
  }
}

describe('createAndroidApp', () => {
  test('success: returns appId from parsed JSON', async () => {
    const result = await createAndroidApp(
      'my-project',
      'com.myapp',
      undefined,
      fakeExecaSuccess('1:android:test')
    )
    assert.equal(result, '1:android:test')
  })

  test('success with display name: passes display name and returns appId', async () => {
    const result = await createAndroidApp(
      'my-project',
      'com.myapp',
      'My App',
      fakeExecaSuccess('1:android:named')
    )
    assert.equal(result, '1:android:named')
  })

  test('failure: execa throws — wraps error with descriptive message', async () => {
    await assert.rejects(
      () =>
        createAndroidApp('my-project', 'com.myapp', undefined, fakeExecaThrows('network error')),
      (err: Error) => {
        assert.ok(
          err.message.includes('Failed to create Android app'),
          `Expected message to include "Failed to create Android app", got: ${err.message}`
        )
        return true
      }
    )
  })

  test('missing appId: throws when result.appId is absent', async () => {
    await assert.rejects(
      () => createAndroidApp('my-project', 'com.myapp', undefined, fakeExecaMissingAppId()),
      (err: Error) => {
        assert.ok(
          err.message.includes('Failed to create Android app'),
          `Expected message to include "Failed to create Android app", got: ${err.message}`
        )
        return true
      }
    )
  })
})

describe('createIOSApp', () => {
  test('success: returns appId from parsed JSON', async () => {
    const result = await createIOSApp(
      'my-project',
      'com.myapp',
      undefined,
      fakeExecaSuccess('1:ios:test')
    )
    assert.equal(result, '1:ios:test')
  })

  test('success with display name: passes display name and returns appId', async () => {
    const result = await createIOSApp(
      'my-project',
      'com.myapp',
      'My App iOS',
      fakeExecaSuccess('1:ios:named')
    )
    assert.equal(result, '1:ios:named')
  })

  test('failure: execa throws — wraps error with descriptive message', async () => {
    await assert.rejects(
      () => createIOSApp('my-project', 'com.myapp', undefined, fakeExecaThrows('network error')),
      (err: Error) => {
        assert.ok(
          err.message.includes('Failed to create iOS app'),
          `Expected message to include "Failed to create iOS app", got: ${err.message}`
        )
        return true
      }
    )
  })

  test('missing appId: throws when result.appId is absent', async () => {
    await assert.rejects(
      () => createIOSApp('my-project', 'com.myapp', undefined, fakeExecaMissingAppId()),
      (err: Error) => {
        assert.ok(
          err.message.includes('Failed to create iOS app'),
          `Expected message to include "Failed to create iOS app", got: ${err.message}`
        )
        return true
      }
    )
  })
})
