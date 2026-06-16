import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  createDefaultFirestoreDatabase,
  enableServices,
  hasDefaultFirestoreDatabase,
  listEnabledServices,
} from '../core/firebase/services.js'

// Fake execaFn helpers — match the ExecaFn signature: (cmd, args) => Promise<{ stdout }>

function fakeExecaSuccess(stdout: string) {
  return async (_cmd: string, _args: string[]) => ({ stdout })
}

function fakeExecaThrows(message: string) {
  return async (_cmd: string, _args: string[]): Promise<{ stdout: string }> => {
    throw new Error(message)
  }
}

describe('listEnabledServices', () => {
  test('success: returns short service names parsed from gcloud JSON output', async () => {
    const result = await listEnabledServices(
      'my-project',
      fakeExecaSuccess(
        JSON.stringify([
          { name: 'projects/my-project/services/identitytoolkit.googleapis.com' },
          { name: 'projects/my-project/services/firestore.googleapis.com' },
        ])
      )
    )
    assert.deepEqual(result, ['identitytoolkit.googleapis.com', 'firestore.googleapis.com'])
  })

  test('failure: execa throws — returns [] instead of throwing', async () => {
    const result = await listEnabledServices('my-project', fakeExecaThrows('network error'))
    assert.deepEqual(result, [])
  })
})

describe('enableServices', () => {
  test('success: resolves without throwing when execa succeeds', async () => {
    await assert.doesNotReject(() =>
      enableServices('my-project', ['firestore.googleapis.com'], fakeExecaSuccess(''))
    )
  })

  test('no-op: resolves immediately when serviceNames is empty', async () => {
    await assert.doesNotReject(() =>
      enableServices('my-project', [], fakeExecaThrows('should not be called'))
    )
  })

  test('failure: execa throws — wraps error with descriptive message', async () => {
    await assert.rejects(
      () => enableServices('my-project', ['firestore.googleapis.com'], fakeExecaThrows('boom')),
      (err: Error) => {
        assert.ok(
          err.message.includes('Failed to enable services'),
          `Expected message to include "Failed to enable services", got: ${err.message}`
        )
        return true
      }
    )
  })
})

describe('hasDefaultFirestoreDatabase', () => {
  test('returns true when a "(default)" database is present', async () => {
    const result = await hasDefaultFirestoreDatabase(
      'my-project',
      fakeExecaSuccess(
        JSON.stringify([{ name: 'projects/my-project/databases/(default)' }])
      )
    )
    assert.equal(result, true)
  })

  test('returns false when no "(default)" database is present', async () => {
    const result = await hasDefaultFirestoreDatabase(
      'my-project',
      fakeExecaSuccess(JSON.stringify([{ name: 'projects/my-project/databases/other-db' }]))
    )
    assert.equal(result, false)
  })

  test('returns false when no databases exist at all', async () => {
    const result = await hasDefaultFirestoreDatabase('my-project', fakeExecaSuccess('[]'))
    assert.equal(result, false)
  })

  test('failure: execa throws — returns false instead of throwing', async () => {
    const result = await hasDefaultFirestoreDatabase(
      'my-project',
      fakeExecaThrows('network error')
    )
    assert.equal(result, false)
  })
})

describe('createDefaultFirestoreDatabase', () => {
  test('success: resolves without throwing when execa succeeds', async () => {
    await assert.doesNotReject(() =>
      createDefaultFirestoreDatabase('my-project', 'nam5', fakeExecaSuccess(''))
    )
  })

  test('success: invokes gcloud with the right args', async () => {
    let capturedArgs: string[] = []
    const captureExeca = async (cmd: string, args: string[]) => {
      assert.equal(cmd, 'gcloud')
      capturedArgs = args
      return { stdout: '' }
    }
    await createDefaultFirestoreDatabase('my-project', 'nam5', captureExeca)
    assert.deepEqual(capturedArgs, [
      'firestore',
      'databases',
      'create',
      '--database=(default)',
      '--location=nam5',
      '--type=firestore-native',
      '--project',
      'my-project',
    ])
  })

  test('failure: execa throws — wraps error with descriptive message', async () => {
    await assert.rejects(
      () => createDefaultFirestoreDatabase('my-project', 'nam5', fakeExecaThrows('boom')),
      (err: Error) => {
        assert.ok(
          err.message.includes('Failed to create Firestore database'),
          `Expected message to include "Failed to create Firestore database", got: ${err.message}`
        )
        return true
      }
    )
  })
})
