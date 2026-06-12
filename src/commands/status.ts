import chalk from 'chalk'
import { existsSync } from 'fs'
import { join } from 'path'

import { loadConfig } from '../core/config/load.js'

export type StatusOptions = Record<string, never>

export async function runStatus(_options: StatusOptions): Promise<void> {
  const cwd = process.cwd()

  const config = await loadConfig(cwd)

  if (!config) {
    console.log(chalk.yellow('  No rn-firebase.config found. Run rn-firebase init first.'))
    return
  }

  console.log(chalk.bold('\n  Firebase setup status\n'))

  const outDir = config.outDir ?? 'keys'

  const checks: Array<{ label: string; path: string }> = [
    { label: 'google-services.json', path: join(cwd, outDir, 'google-services.json') },
    { label: 'GoogleService-Info.plist', path: join(cwd, outDir, 'GoogleService-Info.plist') },
    { label: 'config/firebase.config.*', path: join(cwd, 'config') },
    { label: 'rn-firebase.config', path: cwd },
  ]

  for (const check of checks) {
    const exists = existsSync(check.path)
    const icon = exists ? chalk.green('✔') : chalk.red('✗')
    const label = exists ? chalk.white(check.label) : chalk.gray(check.label)
    console.log(`  ${icon} ${label}`)
  }

  console.log(
    chalk.gray(`\n  Environments configured: ${config.envs.map((e) => e.name).join(', ')}`)
  )
  console.log(chalk.gray(`  Platform: ${config.platform}`))
  console.log(chalk.gray(`  Output dir: ${outDir}\n`))
}
