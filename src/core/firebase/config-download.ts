import { execa } from 'execa'

export async function downloadAndroidConfig(projectId: string, appId: string): Promise<string> {
  const { stdout } = await execa('firebase', [
    'apps:sdkconfig',
    'android',
    appId,
    '--project',
    projectId,
  ])
  return stdout
}

export async function downloadIOSConfig(projectId: string, appId: string): Promise<string> {
  const { stdout } = await execa('firebase', [
    'apps:sdkconfig',
    'ios',
    appId,
    '--project',
    projectId,
  ])
  return stdout
}
