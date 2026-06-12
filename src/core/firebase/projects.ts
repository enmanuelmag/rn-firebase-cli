import { execa } from 'execa'

import type { FirebaseProject } from '../../types.js'

interface FirebaseProjectsJsonResult {
  result?: Array<{
    projectId: string
    displayName?: string
    name?: string
  }>
}

export async function listProjects(): Promise<FirebaseProject[]> {
  const { stdout } = await execa('firebase', ['projects:list', '--json'])
  const parsed = JSON.parse(stdout) as FirebaseProjectsJsonResult

  return (parsed.result ?? []).map((p) => ({
    projectId: p.projectId,
    displayName: p.displayName ?? p.name ?? p.projectId,
  }))
}
