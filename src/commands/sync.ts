import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import chalk from 'chalk'
import { ensureDir } from 'fs-extra'

import { loadConfig } from '../core/config/load.js'
import { buildNativeConfigFilename } from '../core/materializer/expo.js'

export interface SyncOptions {
  env?: string
}

function fileHash(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

export async function runSync(options: SyncOptions): Promise<void> {
  const cwd = process.cwd()

  const config = await loadConfig(cwd)
  if (!config) {
    console.error(chalk.red('  No rn-firebase.config found. Run rn-firebase init first.'))
    process.exit(1)
  }

  const targetEnv = options.env ? config.envs.find((e) => e.name === options.env) : config.envs[0]

  if (!targetEnv) {
    console.error(chalk.red(`  Environment "${options.env}" not found in rn-firebase.config.`))
    process.exit(1)
  }

  let copiedCount = 0
  let skippedCount = 0
  let upToDateCount = 0

  // Android
  if (config.platform === 'android' || config.platform === 'both') {
    const srcFilename = buildNativeConfigFilename(
      targetEnv.name,
      targetEnv.android?.packageName ?? 'android',
      'google-services.json'
    )
    const src = join(cwd, config.outDir, srcFilename)
    const dest = join(cwd, 'android', 'app', 'google-services.json')
    const destDir = join(cwd, 'android', 'app')

    if (!existsSync(src)) {
      console.error(
        chalk.red(
          `  Android config not found: ${srcFilename}\n  Run rn-firebase update to download it first.`
        )
      )
      process.exit(1)
    }

    if (!existsSync(destDir)) {
      console.warn(
        chalk.yellow('  android/app/ not found — run expo prebuild first (skipping Android)')
      )
      skippedCount++
    } else {
      if (existsSync(dest) && fileHash(src) === fileHash(dest)) {
        console.log(chalk.gray('  Android: already up to date'))
        upToDateCount++
      } else {
        await ensureDir(dirname(dest))
        await copyFile(src, dest)
        console.log(chalk.green('  Android: synced google-services.json'))
        copiedCount++
      }
    }
  }

  // iOS
  if (config.platform === 'ios' || config.platform === 'both') {
    const srcFilename = buildNativeConfigFilename(
      targetEnv.name,
      targetEnv.ios?.bundleId ?? 'ios',
      'GoogleService-Info.plist'
    )
    const src = join(cwd, config.outDir, srcFilename)

    if (!existsSync(src)) {
      console.error(
        chalk.red(
          `  iOS config not found: ${srcFilename}\n  Run rn-firebase update to download it first.`
        )
      )
      process.exit(1)
    }

    let dest: string | undefined

    // Try app.json → expo.name first
    const appJsonPath = join(cwd, 'app.json')
    if (existsSync(appJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(appJsonPath, 'utf8')) as {
          expo?: { name?: string }
        }
        const expoName = parsed.expo?.name
        if (expoName && typeof expoName === 'string') {
          const candidate = join(cwd, 'ios', expoName, 'GoogleService-Info.plist')
          const candidateDir = join(cwd, 'ios', expoName)
          if (existsSync(candidateDir)) {
            dest = candidate
          }
        }
      } catch {
        // malformed app.json — fall through to directory scan
      }
    }

    // Fallback: scan ios/ for first subdir containing GoogleService-Info.plist
    if (!dest) {
      const iosDir = join(cwd, 'ios')
      if (existsSync(iosDir)) {
        try {
          const entries = readdirSync(iosDir)
          for (const entry of entries) {
            const entryPath = join(iosDir, entry)
            if (statSync(entryPath).isDirectory()) {
              const candidate = join(entryPath, 'GoogleService-Info.plist')
              if (existsSync(candidate)) {
                dest = candidate
                break
              }
            }
          }
        } catch {
          // could not read ios dir
        }
      }
    }

    if (!dest) {
      console.warn(
        chalk.yellow('  ios/ native folder not found — run expo prebuild first (skipping iOS)')
      )
      skippedCount++
    } else {
      if (existsSync(dest) && fileHash(src) === fileHash(dest)) {
        console.log(chalk.gray('  iOS: already up to date'))
        upToDateCount++
      } else {
        await ensureDir(dirname(dest))
        await copyFile(src, dest)
        console.log(chalk.green('  iOS: synced GoogleService-Info.plist'))
        copiedCount++
      }
    }
  }

  if (copiedCount === 0 && skippedCount === 0) {
    console.log(chalk.gray('\n  All Firebase config files are up to date.'))
  } else if (copiedCount > 0) {
    console.log(chalk.bold.green(`\n  Synced ${copiedCount} file(s).`))
  }
}
