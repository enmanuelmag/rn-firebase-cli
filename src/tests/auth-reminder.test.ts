import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildAuthReminderLines } from '../core/helpers/auth-reminder.js'

/** Strip ANSI escape codes so assertions can match plain text */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '')
}

describe('buildAuthReminderLines', () => {
  test('interpolates the real project id into the console link', () => {
    const lines = buildAuthReminderLines('my-real-project').map(stripAnsi)
    const joined = lines.join('\n')
    assert.ok(
      joined.includes(
        'https://console.firebase.google.com/project/my-real-project/authentication/providers'
      ),
      `Expected a project-specific console link, got:\n${joined}`
    )
  })

  test('uses the given project id, not some other project', () => {
    const lines = buildAuthReminderLines('another-project').map(stripAnsi)
    const joined = lines.join('\n')
    assert.ok(joined.includes('another-project'))
    assert.ok(!joined.includes('my-real-project'))
  })

  test('mentions re-downloading native config files (plist + json)', () => {
    const joined = buildAuthReminderLines('proj').map(stripAnsi).join('\n')
    assert.ok(joined.includes('GoogleService-Info.plist'), 'should mention iOS plist file')
    assert.ok(joined.includes('google-services.json'), 'should mention Android json file')
  })

  test('mentions REVERSED_CLIENT_ID as the reason for re-downloading', () => {
    const joined = buildAuthReminderLines('proj').map(stripAnsi).join('\n')
    assert.ok(joined.includes('REVERSED_CLIENT_ID'))
  })

  test('tells the user to run `rn-firebase update` to re-fetch config', () => {
    const joined = buildAuthReminderLines('proj').map(stripAnsi).join('\n')
    assert.ok(joined.includes('rn-firebase update'))
  })

  test('returns a non-empty array of lines (suitable for drawBox)', () => {
    const lines = buildAuthReminderLines('proj')
    assert.ok(Array.isArray(lines))
    assert.ok(lines.length > 0)
  })
})
