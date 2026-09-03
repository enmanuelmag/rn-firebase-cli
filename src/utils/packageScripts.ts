import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'

import { detectProjectType } from '../core/detector/index.js'

import type { Platform } from '../types.js'

/**
 * Injects platform:env scripts into the target project's package.json.
 * Checks for dotenv-cli in dependencies; warns if missing.
 * Only injects scripts that do not already exist — never overwrites.
 * Prints a summary of what was added and what was skipped.
 */
export async function injectPackageScripts(
  cwd: string,
  envName: string,
  platform: Platform
): Promise<void> {
  const pkgPath = join(cwd, 'package.json')

  if (!existsSync(pkgPath)) {
    return
  }

  let pkg: Record<string, unknown>
  try {
    const raw = await readFile(pkgPath, 'utf8')
    pkg = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return
  }

  // Check for dotenv-cli
  const deps = (pkg['dependencies'] ?? {}) as Record<string, string>
  const devDeps = (pkg['devDependencies'] ?? {}) as Record<string, string>
  if (!deps['dotenv-cli'] && !devDeps['dotenv-cli']) {
    console.warn(
      chalk.yellow(
        `\n  Warning: dotenv-cli not found in package.json dependencies.\n  Run: pnpm add -D dotenv-cli\n`
      )
    )
  }

  // Build candidate scripts based on platform
  const candidates: Record<string, string> = {}

  if (platform === 'ios' || platform === 'both') {
    candidates[`ios:${envName}`] =
      `rn-firebase sync --env ${envName} --clean-if-changed && APP_ENV=${envName} dotenv -e .env.${envName} -- expo run:ios`
  }

  if (platform === 'android' || platform === 'both') {
    candidates[`android:${envName}`] =
      `rn-firebase sync --env ${envName} --clean-if-changed && APP_ENV=${envName} dotenv -e .env.${envName} -- expo run:android`
  }

  candidates[`start:${envName}`] = `APP_ENV=${envName} dotenv -e .env.${envName} -- expo start`

  const isExpo = detectProjectType(cwd) === 'expo'

  if (isExpo) {
    if (platform === 'ios' || platform === 'both') {
      candidates[`build:${envName}:ios`] =
        `rn-firebase build --platform ios --env ${envName} --profile production`
      candidates[`build:${envName}:ios:submit`] =
        `rn-firebase build --platform ios --env ${envName} --profile production --submit`
      candidates[`build:${envName}:ios:submit:local`] =
        `rn-firebase build --platform ios --env ${envName} --profile production --submit --submit-mode local`
    }

    if (platform === 'android' || platform === 'both') {
      candidates[`build:${envName}:android`] =
        `rn-firebase build --platform android --env ${envName} --profile production`
      candidates[`build:${envName}:android:submit`] =
        `rn-firebase build --platform android --env ${envName} --profile production --submit`
      candidates[`build:${envName}:android:submit:local`] =
        `rn-firebase build --platform android --env ${envName} --profile production --submit --submit-mode local`
    }

    // eas-update requires -m/--message, which varies per publish and cannot be
    // baked into a static script value. It is deliberately omitted here — users
    // are expected to run: npm run eas-update:<env> -- -m "your message"
    candidates[`eas-update:${envName}`] = `rn-firebase eas-update --profile ${envName}`
  }

  // Ensure scripts key exists
  if (!pkg['scripts'] || typeof pkg['scripts'] !== 'object') {
    pkg['scripts'] = {}
  }
  const scripts = pkg['scripts'] as Record<string, string>

  let injectedCount = 0
  let skippedCount = 0

  for (const [key, value] of Object.entries(candidates)) {
    if (key in scripts) {
      console.log(chalk.gray(`  Skipped script (already exists): ${key}`))
      skippedCount++
    } else {
      scripts[key] = value
      console.log(chalk.green(`  Injected script: ${key}`))
      injectedCount++
    }
  }

  if (injectedCount > 0) {
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  }

  if (injectedCount === 0 && skippedCount > 0) {
    console.log(chalk.gray('  No new scripts to inject — all already present.'))
  }

  if (!isExpo) {
    console.log(
      chalk.gray(
        '  Skipped build/eas-update scripts — Expo-only feature, this project was detected as bare React Native (or undetected).'
      )
    )
  }
}
