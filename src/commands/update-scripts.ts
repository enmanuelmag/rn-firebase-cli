import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'

import { loadConfig } from '../core/config/load.js'
import { detectProjectType } from '../core/detector/index.js'

export async function runUpdateScripts(): Promise<void> {
  const cwd = process.cwd()

  const projectType = detectProjectType(cwd)
  const isExpo = projectType === 'expo'

  const config = await loadConfig(cwd)
  if (!config) {
    console.error(chalk.red('  No rn-firebase.config found. Run rn-firebase init first.'))
    process.exit(1)
  }

  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) {
    console.error(chalk.red('  No package.json found in the current directory.'))
    process.exit(1)
  }

  let pkg: Record<string, unknown>
  try {
    const raw = await readFile(pkgPath, 'utf8')
    pkg = JSON.parse(raw) as Record<string, unknown>
  } catch {
    console.error(chalk.red('  Could not parse package.json.'))
    process.exit(1)
  }

  if (!pkg['scripts'] || typeof pkg['scripts'] !== 'object') {
    pkg['scripts'] = {}
  }
  const scripts = pkg['scripts'] as Record<string, string>

  let updatedCount = 0
  let skippedCount = 0

  for (const env of config.envs) {
    // Each candidate carries its own idempotency `prefix` — only scripts that
    // already start with that exact prefix are considered "up to date" and
    // left untouched; anything else (including user-customized scripts) gets
    // overwritten with the freshly generated value.
    const candidates: Array<{ key: string; value: string; prefix: string }> = []

    if (config.platform === 'ios' || config.platform === 'both') {
      candidates.push({
        key: `ios:${env.name}`,
        value: `rn-firebase sync --env ${env.name} --clean-if-changed && APP_ENV=${env.name} dotenv -e .env.${env.name} -- expo run:ios`,
        prefix: 'rn-firebase sync',
      })
    }

    if (config.platform === 'android' || config.platform === 'both') {
      candidates.push({
        key: `android:${env.name}`,
        value: `rn-firebase sync --env ${env.name} --clean-if-changed && APP_ENV=${env.name} dotenv -e .env.${env.name} -- expo run:android`,
        prefix: 'rn-firebase sync',
      })
    }

    if (isExpo) {
      if (config.platform === 'ios' || config.platform === 'both') {
        candidates.push({
          key: `build:${env.name}:ios`,
          value: `rn-firebase build --platform ios --env ${env.name} --profile production`,
          prefix: 'rn-firebase build',
        })
        candidates.push({
          key: `build:${env.name}:ios:submit`,
          value: `rn-firebase build --platform ios --env ${env.name} --profile production --submit`,
          prefix: 'rn-firebase build',
        })
      }

      if (config.platform === 'android' || config.platform === 'both') {
        candidates.push({
          key: `build:${env.name}:android`,
          value: `rn-firebase build --platform android --env ${env.name} --profile production`,
          prefix: 'rn-firebase build',
        })
        candidates.push({
          key: `build:${env.name}:android:submit`,
          value: `rn-firebase build --platform android --env ${env.name} --profile production --submit`,
          prefix: 'rn-firebase build',
        })
      }

      // eas-update requires -m/--message, which varies per publish and cannot
      // be baked into a static script value. It is deliberately omitted here —
      // users are expected to run: npm run eas-update:<env> -- -m "your message"
      candidates.push({
        key: `eas-update:${env.name}`,
        value: `rn-firebase eas-update --profile ${env.name}`,
        prefix: 'rn-firebase eas-update',
      })
    }

    for (const { key, value, prefix } of candidates) {
      const existing = scripts[key]
      if (existing !== undefined && existing.startsWith(prefix)) {
        console.log(chalk.gray(`  Skipped (already up to date): ${key}`))
        skippedCount++
      } else {
        scripts[key] = value
        console.log(chalk.green(`  Updated: ${key}`))
        updatedCount++
      }
    }
  }

  if (updatedCount > 0) {
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  }

  if (!isExpo) {
    console.log(
      chalk.gray(
        '  Skipped build/eas-update scripts — Expo-only feature, this project was detected as bare React Native (or undetected).'
      )
    )
  }

  console.log(`\n  ${updatedCount} script(s) updated, ${skippedCount} already up to date.`)
}
