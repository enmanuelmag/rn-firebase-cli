import { execa } from 'execa'

import type { FirebaseProject } from '../../types.js'

type ExecaFn = (cmd: string, args: string[]) => Promise<{ stdout: string }>

interface FirebaseProjectsJsonResult {
  result?: Array<{
    projectId: string
    displayName?: string
    name?: string
  }>
}

interface FirebaseCreateProjectJsonResult {
  result?: {
    projectId?: string
    name?: string
    displayName?: string
  }
}

export async function listProjects(): Promise<FirebaseProject[]> {
  const { stdout } = await execa('firebase', ['projects:list', '--json'])
  const parsed = JSON.parse(stdout) as FirebaseProjectsJsonResult

  return (parsed.result ?? []).map((p) => ({
    projectId: p.projectId,
    displayName: p.displayName ?? p.name ?? p.projectId,
  }))
}

export async function createProject(
  displayName: string,
  projectId: string,
  execaFn: ExecaFn = execa
): Promise<string> {
  try {
    const { stdout } = await execaFn('firebase', [
      'projects:create',
      projectId,
      '--display-name',
      displayName,
      '--json',
    ])
    const parsed = JSON.parse(stdout) as FirebaseCreateProjectJsonResult
    const returnedId = parsed.result?.projectId ?? parsed.result?.name

    if (!returnedId) throw new Error('No projectId returned from Firebase CLI')
    return returnedId
  } catch (err) {
    throw new Error(
      `Failed to create Firebase project "${projectId}" (display name: "${displayName}"): ${(err as Error).message}`
    )
  }
}
