import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'

import { loadConfig } from '../core/config/load.js'

export async function runUpdateScripts(): Promise<void> {
  const cwd = process.cwd()

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
    const candidates: Array<{ key: string; value: string }> = []

    if (config.platform === 'ios' || config.platform === 'both') {
      candidates.push({
        key: `ios:${env.name}`,
        value: `rn-firebase sync --env ${env.name} && APP_ENV=${env.name} dotenv -e .env.${env.name} -- expo run:ios`,
      })
    }

    if (config.platform === 'android' || config.platform === 'both') {
      candidates.push({
        key: `android:${env.name}`,
        value: `rn-firebase sync --env ${env.name} && APP_ENV=${env.name} dotenv -e .env.${env.name} -- expo run:android`,
      })
    }

    for (const { key, value } of candidates) {
      const existing = scripts[key]
      if (existing !== undefined && existing.startsWith('rn-firebase sync')) {
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

  console.log(
    `\n  ${updatedCount} script(s) updated, ${skippedCount} already up to date.`
  )
}
