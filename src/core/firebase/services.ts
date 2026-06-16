import chalk from 'chalk'
import { execa } from 'execa'

type ExecaFn = (cmd: string, args: string[]) => Promise<{ stdout: string }>

interface GcloudService {
  name: string
}

interface GcloudFirestoreDatabase {
  name: string
}

const DEFAULT_FIRESTORE_DATABASE_ID = '(default)'

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

/**
 * Checks whether the project already has a default (`(default)`) Firestore database.
 * If gcloud is not installed or the call fails, returns false with a warning
 * (caller will then attempt creation, which is the safer default).
 */
export async function hasDefaultFirestoreDatabase(
  projectId: string,
  execaFn: ExecaFn = execa
): Promise<boolean> {
  try {
    const { stdout } = await execaFn('gcloud', [
      'firestore',
      'databases',
      'list',
      '--project',
      projectId,
      '--format',
      'json',
    ])
    const parsed = JSON.parse(stdout) as GcloudFirestoreDatabase[]
    return parsed.some((db) => {
      // name is like "projects/xxx/databases/(default)"
      const parts = db.name.split('/')
      return parts[parts.length - 1] === DEFAULT_FIRESTORE_DATABASE_ID
    })
  } catch (err) {
    console.warn(
      chalk.yellow(
        `  Warning: Could not check existing Firestore databases via gcloud: ${(err as Error).message}`
      )
    )
    return false
  }
}

/**
 * Creates the default Firestore database for the project in the given location.
 * Throws with a descriptive error if the call fails.
 */
export async function createDefaultFirestoreDatabase(
  projectId: string,
  location: string,
  execaFn: ExecaFn = execa
): Promise<void> {
  try {
    await execaFn('gcloud', [
      'firestore',
      'databases',
      'create',
      `--database=${DEFAULT_FIRESTORE_DATABASE_ID}`,
      `--location=${location}`,
      '--type=firestore-native',
      '--project',
      projectId,
    ])
  } catch (err) {
    throw new Error(
      `Failed to create Firestore database for project "${projectId}": ${(err as Error).message}`
    )
  }
}
