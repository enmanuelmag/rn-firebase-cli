import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import inquirer from 'inquirer'
import { join } from 'path'

export type ProjectType = 'expo' | 'bare'

/**
 * Returns the env var prefix for the given project type.
 * Expo uses EXPO_PUBLIC_ so that Expo's env var system exposes the value to the client bundle.
 * Bare RN uses no prefix (react-native-config convention).
 */
export function getEnvPrefix(projectType: ProjectType): string {
  return projectType === 'expo' ? 'EXPO_PUBLIC_' : ''
}

/**
 * Returns the full env var name (with prefix) for a given bare key and project type.
 * Example: getEnvVarName('FIREBASE_API_KEY', 'expo') → 'EXPO_PUBLIC_FIREBASE_API_KEY'
 */
export function getEnvVarName(key: string, projectType: ProjectType): string {
  return `${getEnvPrefix(projectType)}${key}`
}

/**
 * Generates the content of a .env file from a map of bare key → value pairs.
 * Applies the appropriate prefix for the project type.
 * Lines with undefined or empty values are omitted entirely.
 */
export function generateEnvContent(
  vars: Record<string, string | undefined>,
  projectType: ProjectType
): string {
  const prefix = getEnvPrefix(projectType)
  const lines: string[] = []

  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined || value === '') continue
    lines.push(`${prefix}${key}=${value}`)
  }

  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}

/**
 * Parses a google-services.json raw string and extracts the relevant Firebase vars.
 * Returns a map of bare key names (no prefix) to values.
 * Fields that cannot be found are omitted from the returned object.
 */
export function parseFirebaseVarsFromAndroid(rawJson: string): Record<string, string | undefined> {
  try {
    const json = JSON.parse(rawJson) as {
      project_info?: {
        project_id?: string
        project_number?: string
        storage_bucket?: string
      }
      client?: Array<{
        client_info?: { mobilesdk_app_id?: string }
        api_key?: Array<{ current_key?: string }>
        oauth_client?: Array<{ client_type?: number; client_id?: string }>
      }>
    }

    const projectInfo = json.project_info ?? {}
    const firstClient = json.client?.[0] ?? {}

    const projectId = projectInfo.project_id
    const apiKey = firstClient.api_key?.[0]?.current_key
    const appId = firstClient.client_info?.mobilesdk_app_id
    const messagingSenderId = projectInfo.project_number
    const storageBucket = projectInfo.storage_bucket
    const authDomain = projectId ? `${projectId}.firebaseapp.com` : undefined

    // webClientId is client_type === 3
    const webClient = firstClient.oauth_client?.find((c) => c.client_type === 3)
    const webClientId = webClient?.client_id

    const result: Record<string, string | undefined> = {}

    if (apiKey) result['FIREBASE_API_KEY'] = apiKey
    if (authDomain) result['FIREBASE_AUTH_DOMAIN'] = authDomain
    if (projectId) result['FIREBASE_PROJECT_ID'] = projectId
    if (storageBucket) result['FIREBASE_STORAGE_BUCKET'] = storageBucket
    if (messagingSenderId) result['FIREBASE_MESSAGING_SENDER_ID'] = messagingSenderId
    if (appId) result['FIREBASE_APP_ID'] = appId
    if (webClientId) result['FIREBASE_WEB_CLIENT_ID'] = webClientId

    return result
  } catch {
    return {}
  }
}

/**
 * Builds the usage hint string for display at the end of `runInit`.
 * The returned string is a box-drawing block that shows how to access
 * Firebase env vars depending on the project type.
 */
export function buildUsageHint(projectType: ProjectType, envName: string): string {
  const boxWidth = 64
  const border = '─'.repeat(boxWidth - 2)

  const usageLines =
    projectType === 'expo'
      ? [
          `  Expo: access Firebase env vars via:`,
          `    process.env.EXPO_PUBLIC_FIREBASE_API_KEY`,
          `    process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID`,
          `    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID  (etc.)`,
        ]
      : [
          `  Bare RN: install react-native-config, then:`,
          `    import Config from 'react-native-config'`,
          `    Config.FIREBASE_API_KEY`,
          `    Config.FIREBASE_WEB_CLIENT_ID  (etc.)`,
        ]

  const topBorder = `┌${border}┐`
  const header = `│` + ` Firebase env vars written to .env.${envName}`.padEnd(boxWidth - 2) + `│`
  const emptyLine = `│` + ' '.repeat(boxWidth - 2) + `│`
  const contentLines = usageLines.map((line) => `│` + line.padEnd(boxWidth - 2) + `│`)
  const bottomBorder = `└${border}┘`

  return [topBorder, header, emptyLine, ...contentLines, bottomBorder].join('\n')
}

/**
 * Writes a .env.{envName} file to the given cwd.
 * If the file already exists, prompts the user for confirmation before overwriting.
 * Lines with undefined or empty values are never written.
 */
export async function writeEnvFile(cwd: string, envName: string, content: string): Promise<void> {
  const filePath = join(cwd, `.env.${envName}`)

  if (existsSync(filePath)) {
    const existing = await readFile(filePath, 'utf-8')
    if (existing === content) {
      // Identical content — nothing to do
      return
    }

    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `.env.${envName} already exists. Overwrite?`,
        default: false,
      },
    ])

    if (!overwrite) {
      return
    }
  }

  await writeFile(filePath, content)
}
