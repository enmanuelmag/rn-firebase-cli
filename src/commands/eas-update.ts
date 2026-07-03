import chalk from 'chalk'

import { detectProjectType } from '../core/detector/index.js'
import {
  buildEasUpdateArgs,
  checkProfileAgainstEasJson,
  renderHeader,
  runWithRepaint,
} from '../core/helpers/build-run.js'

export interface EasUpdateOptions {
  profile?: string
  message?: string
}

export async function runEasUpdate(options: EasUpdateOptions): Promise<void> {
  const cwd = process.cwd()

  const projectType = detectProjectType(cwd)
  if (projectType === 'bare' || projectType === null) {
    console.error(
      chalk.red(
        '  Build support for bare React Native projects is not available yet. This feature currently only supports Expo projects.'
      )
    )
    process.exit(1)
  }

  if (!options.message) {
    console.error(
      chalk.red('  Missing required -m/--message <text> flag for rn-firebase eas-update.')
    )
    process.exit(1)
  }

  const profile = options.profile ?? 'production'
  // Branch defaults to the profile value — no separate --branch flag in v1
  // (see task 23 design decision).
  const branch = profile

  const profileWarning = checkProfileAgainstEasJson(cwd, profile)
  if (profileWarning) console.log(chalk.yellow(profileWarning))

  console.log(
    renderHeader({
      command: 'eas-update',
      platform: 'all',
      profile,
    })
  )

  const args = buildEasUpdateArgs({ branch, message: options.message })

  const result = await runWithRepaint({
    args,
    header: renderHeader({ command: 'eas-update', platform: 'all', profile }),
    logPrefix: 'rn-firebase-eas-update',
  })

  if (result.exitCode !== 0) {
    process.exitCode = 1
    return
  }

  console.log(chalk.bold.green('\n  Update published successfully.'))
}
