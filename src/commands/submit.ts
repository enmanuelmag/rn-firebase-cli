import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'

import { loadConfig } from '../core/config/load.js'
import { runLocalAndroidSubmit } from '../core/submit/android.js'
import { runLocalIosSubmit } from '../core/submit/ios.js'

export interface SubmitOptions {
  path: string
  platform: 'ios' | 'android'
  env?: string
  profile?: string
}

export async function runSubmit(options: SubmitOptions): Promise<void> {
  const cwd = process.cwd()

  // Validate the artifact file exists
  if (!existsSync(options.path)) {
    console.error(chalk.red(`  Artifact file not found: ${options.path}`))
    process.exit(1)
  }

  // Load config for profile resolution (optional — uses 'production' as default)
  let profile = options.profile ?? 'production'
  if (options.env) {
    const config = await loadConfig(cwd)
    if (config) {
      const env = config.envs.find((e) => e.name === options.env)
      if (!env) {
        console.error(chalk.red(`  Environment "${options.env}" not found in rn-firebase.config.`))
        process.exit(1)
      }
    }
  }

  console.log(
    chalk.bold(
      `\n  Submitting ${options.path} to ${options.platform === 'ios' ? 'App Store Connect' : 'Google Play'}...`
    )
  )

  if (options.platform === 'ios') {
    await runLocalIosSubmit({ artifactPath: options.path, profile })
  } else {
    await runLocalAndroidSubmit({ artifactPath: options.path, profile })
  }

  console.log(chalk.bold.green(`\n  Submit completed successfully (${options.platform}).`))
}
