import { existsSync, readFileSync } from 'fs'
import { glob } from 'fs/promises'
import { join } from 'path'

export async function detectPackageName(cwd: string): Promise<string | undefined> {
  const gradlePath = join(cwd, 'android', 'app', 'build.gradle')
  if (!existsSync(gradlePath)) return undefined

  const content = readFileSync(gradlePath, 'utf-8')
  const match = content.match(/applicationId\s+["']([^"']+)["']/)
  return match?.[1]
}

export async function detectBundleId(cwd: string): Promise<string | undefined> {
  const iosDir = join(cwd, 'ios')
  if (!existsSync(iosDir)) return undefined

  const pbxprojFiles: string[] = []
  for await (const file of glob('**/*.xcodeproj/project.pbxproj', { cwd: iosDir })) {
    pbxprojFiles.push(join(iosDir, file))
  }

  if (pbxprojFiles.length === 0) return undefined

  const content = readFileSync(pbxprojFiles[0], 'utf-8')
  const match = content.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/)
  return match?.[1]?.trim()
}

export function detectPackageNameFromAppJson(appJson: Record<string, unknown>): string | undefined {
  const expo = appJson.expo as Record<string, unknown> | undefined
  const android = expo?.android as Record<string, unknown> | undefined
  return android?.package as string | undefined
}

export function detectBundleIdFromAppJson(appJson: Record<string, unknown>): string | undefined {
  const expo = appJson.expo as Record<string, unknown> | undefined
  const ios = expo?.ios as Record<string, unknown> | undefined
  return ios?.bundleIdentifier as string | undefined
}
