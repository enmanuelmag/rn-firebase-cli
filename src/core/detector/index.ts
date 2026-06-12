import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import type { ProjectType } from '../../types.js'

export function detectProjectType(cwd: string): ProjectType | null {
  const appJsonPath = join(cwd, 'app.json')
  if (existsSync(appJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(appJsonPath, 'utf-8')) as Record<string, unknown>
      if ('expo' in parsed) return 'expo'
    } catch {
      // ignore
    }
  }

  if (existsSync(join(cwd, 'app.config.js')) || existsSync(join(cwd, 'app.config.ts'))) {
    return 'expo'
  }

  if (existsSync(join(cwd, 'android')) || existsSync(join(cwd, 'ios'))) {
    return 'bare'
  }

  return null
}

export {
  detectBundleId,
  detectBundleIdFromAppJson,
  detectPackageName,
  detectPackageNameFromAppJson,
} from './bundle-ids.js'
export { detectConfigExtension } from './config-ext.js'
