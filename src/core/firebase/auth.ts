import chalk from 'chalk'
import { execa } from 'execa'

export async function checkFirebaseToolsInstalled(): Promise<void> {
  try {
    await execa('firebase', ['--version'])
  } catch {
    throw new Error(
      chalk.red(
        'firebase-tools is not installed or not in PATH.\n' +
        'Install it with: npm install -g firebase-tools\n' +
        'Then authenticate with: firebase login',
      ),
    )
  }
}

export async function ensureAuth(): Promise<void> {
  try {
    await execa('firebase', ['projects:list', '--json'])
  } catch {
    console.log(chalk.yellow('  Not authenticated with Firebase. Launching login...'))
    await execa('firebase', ['login'], { stdio: 'inherit' })
  }
}
