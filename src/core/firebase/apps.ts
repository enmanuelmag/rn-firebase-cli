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
