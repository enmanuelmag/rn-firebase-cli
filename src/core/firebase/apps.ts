import { execa } from 'execa'

import type { FirebaseApp } from '../../types.js'

interface FirebaseAppsJsonResult {
  result?: Array<{
    appId: string
    displayName?: string
    packageName?: string
    bundleId?: string
  }>
}

interface FirebaseCreateAppJsonResult {
  result?: { appId: string }
}

type ExecaFn = (cmd: string, args: string[]) => Promise<{ stdout: string }>

export async function createAndroidApp(
  projectId: string,
  packageName: string,
  displayName?: string,
  execaFn: ExecaFn = execa
): Promise<string> {
  try {
    const args = ['apps:create', 'ANDROID']

    if (displayName) args.push(displayName)

    args.push('--package-name', packageName, '--project', projectId, '--json')
    const { stdout } = await execaFn('firebase', args)

    const parsed = JSON.parse(stdout) as FirebaseCreateAppJsonResult
    const appId = parsed.result?.appId

    if (!appId) throw new Error('No appId returned from Firebase CLI')
    return appId
  } catch (err) {
    throw new Error(
      `Failed to create Android app "${packageName}" in project "${projectId}": ${(err as Error).message}`
    )
  }
}

export async function createIOSApp(
  projectId: string,
  bundleId: string,
  displayName?: string,
  execaFn: ExecaFn = execa
): Promise<string> {
  try {
    const args = ['apps:create', 'IOS']

    if (displayName) args.push(displayName)

    args.push('--bundle-id', bundleId, '--project', projectId, '--json')
    const { stdout } = await execaFn('firebase', args)

    const parsed = JSON.parse(stdout) as FirebaseCreateAppJsonResult
    const appId = parsed.result?.appId

    if (!appId) throw new Error('No appId returned from Firebase CLI')
    return appId
  } catch (err) {
    throw new Error(
      `Failed to create iOS app "${bundleId}" in project "${projectId}": ${(err as Error).message}`
    )
  }
}

export async function listAndroidApps(projectId: string): Promise<FirebaseApp[]> {
  try {
    const { stdout } = await execa('firebase', [
      'apps:list',
      'ANDROID',
      '--project',
      projectId,
      '--json',
    ])
    const parsed = JSON.parse(stdout) as FirebaseAppsJsonResult

    return (parsed.result ?? []).map((a) => ({
      appId: a.appId,
      displayName: a.displayName,
      packageName: a.packageName,
    }))
  } catch {
    return []
  }
}

export async function listIOSApps(projectId: string): Promise<FirebaseApp[]> {
  try {
    const { stdout } = await execa('firebase', [
      'apps:list',
      'IOS',
      '--project',
      projectId,
      '--json',
    ])
    const parsed = JSON.parse(stdout) as FirebaseAppsJsonResult

    return (parsed.result ?? []).map((a) => ({
      appId: a.appId,
      displayName: a.displayName,
      bundleId: a.bundleId,
    }))
  } catch {
    return []
  }
}
