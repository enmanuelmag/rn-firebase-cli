import { Command } from 'commander'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { runAdd } from './commands/add.js'
import { runBuild } from './commands/build.js'
import { runEasUpdate } from './commands/eas-update.js'
import { runInit } from './commands/init.js'
import { runStatus } from './commands/status.js'
import { runSync } from './commands/sync.js'
import { runUpdate } from './commands/update.js'
import { runUpdateScripts } from './commands/update-scripts.js'
import { checkForUpdate, printUpdateMessage } from './core/update/check.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
  name: string
  version: string
}

const updateCheck = checkForUpdate(pkg.name, pkg.version)

const program = new Command()

program
  .name('rn-firebase')
  .description('Automated Firebase setup for React Native (Expo & Bare)')
  .version(pkg.version)

program
  .command('init')
  .description('Interactive wizard to configure Firebase in your React Native project')
  .option('--project <id>', 'Firebase project ID (skips interactive selection)')
  .option('--platform <platform>', 'Platform to configure: android | ios | both')
  .option('--out <dir>', 'Output directory for config files (default: keys)')
  .option('--no-gitignore', 'Skip updating .gitignore')
  .action(
    async (opts: { project?: string; platform?: string; out?: string; gitignore: boolean }) => {
      await runInit({
        project: opts.project,
        platform: opts.platform as 'android' | 'ios' | 'both' | undefined,
        out: opts.out,
        gitignore: opts.gitignore,
      })
    }
  )

program
  .command('status')
  .description('Show which Firebase config files are configured in this project')
  .action(async () => {
    await runStatus({})
  })

program
  .command('update')
  .description('Re-download Firebase config files (useful after changing project or adding apps)')
  .option('--env <name>', 'Target environment name (default: first env in config)')
  .action(async (opts: { env?: string }) => {
    await runUpdate({ env: opts.env })
  })

program
  .command('add')
  .description('Add a new Firebase environment to an already-initialized project')
  .action(async () => {
    await runAdd()
  })

program
  .command('sync')
  .description('Copy the active Firebase config files into the native ios/ and android/ folders')
  .option('--env <name>', 'Environment name to activate (default: first env in config)')
  .option(
    '--clean-if-changed',
    'Delete the native ios/ or android/ folder when the active Firebase config hash changed, forcing a clean expo prebuild'
  )
  .action(async (opts: { env?: string; cleanIfChanged?: boolean }) => {
    await runSync({ env: opts.env, cleanIfChanged: opts.cleanIfChanged })
  })

program
  .command('update-scripts')
  .description(
    'Update package.json scripts to include rn-firebase sync before each ios/android run'
  )
  .action(async () => {
    await runUpdateScripts()
  })

program
  .command('build')
  .description('Run a local EAS build (and optional local submit) for a given environment')
  .option('-p, --platform <platform>', 'Platform to build for (android|ios|all)', 'all')
  .option('--env <name>', 'Environment name (validated against rn-firebase.config)')
  .option('--profile <profile>', 'EAS build profile (free-form, passed through to eas)')
  .option('-o, --output <dir>', 'Output folder for build artifacts', 'build')
  .option('--submit', 'Also run eas submit --local after a successful build')
  .option(
    '--binary-version <version>',
    'Reuse an existing binary ("latest" or a build id) instead of running a local build'
  )
  .option('-s, --skip-build-validation', 'Skip the built-version duplicate check')
  .action(
    async (opts: {
      platform: 'android' | 'ios' | 'all'
      env?: string
      profile?: string
      output: string
      submit?: boolean
      binaryVersion?: string
      skipBuildValidation?: boolean
    }) => {
      await runBuild({
        platform: opts.platform,
        env: opts.env,
        profile: opts.profile,
        output: opts.output,
        submit: opts.submit,
        binaryVersion: opts.binaryVersion,
        skipBuildValidation: opts.skipBuildValidation,
      })
    }
  )

program
  .command('eas-update')
  .description(
    'Publish an OTA update via `eas update` (local-only, see build for local EAS builds)'
  )
  .option('--profile <profile>', 'EAS update profile / branch (free-form)')
  .option('-m, --message <message>', 'Update message (required)')
  .action(async (opts: { profile?: string; message?: string }) => {
    await runEasUpdate({ profile: opts.profile, message: opts.message })
  })

program.hook('postAction', async () => {
  const update = await updateCheck
  if (update) printUpdateMessage(update)
})

program.parse()
