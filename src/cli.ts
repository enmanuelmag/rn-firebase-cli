import { Command } from 'commander'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { runInit } from './commands/init.js'
import { runStatus } from './commands/status.js'
import { runUpdate } from './commands/update.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string
}

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

program.parse()
