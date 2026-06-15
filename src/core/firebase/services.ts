import chalk from 'chalk'
import { execa } from 'execa'

type ExecaFn = (cmd: string, args: string[]) => Promise<{ stdout: string }>

interface GcloudService {
  name: string
}

/**
 * Returns the list of enabled GCP service names for the given project.
 * Each entry is just the short name, e.g. "identitytoolkit.googleapis.com".
 * If gcloud is not installed or the call fails, returns [] with a warning.
 */
export async function listEnabledServices(
  projectId: string,
  execaFn: ExecaFn = execa
): Promise<string[]> {
  try {
    const { stdout } = await execaFn('gcloud', [
      'services',
      'list',
      '--enabled',
      '--project',
      projectId,
      '--format',
      'json',
    ])
    const parsed = JSON.parse(stdout) as GcloudService[]
    return parsed.map((s) => {
      // name is like "projects/xxx/services/identitytoolkit.googleapis.com"
      const parts = s.name.split('/')
      return parts[parts.length - 1]
    })
  } catch (err) {
    console.warn(
      chalk.yellow(
        `  Warning: Could not check enabled services via gcloud: ${(err as Error).message}`
      )
    )
    return []
  }
}

/**
 * Enables the given GCP services for the project.
 * Throws with a descriptive error if the call fails.
 */
export async function enableServices(
  projectId: string,
  serviceNames: string[],
  execaFn: ExecaFn = execa
): Promise<void> {
  if (serviceNames.length === 0) return

  try {
    await execaFn('gcloud', ['services', 'enable', ...serviceNames, '--project', projectId])
  } catch (err) {
    throw new Error(
      `Failed to enable services [${serviceNames.join(', ')}] for project "${projectId}": ${(err as Error).message}`
    )
  }
}
