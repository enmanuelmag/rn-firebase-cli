import { existsSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import dotenv from 'dotenv'

import { loadConfig } from '../core/config/load.js'
import { detectProjectType } from '../core/detector/index.js'
import {
  buildEasBuildArgs,
  buildEasSubmitArgs,
  checkProfileAgainstEasJson,
  renderHeader,
  runWithRepaint,
} from '../core/helpers/build-run.js'
import {
  addBuiltVersion,
  hasBuiltVersion,
  readBuiltVersions,
  resolveAppVersion,
  writeBuiltVersions,
} from '../core/helpers/built-versions.js'
import { ensureStateGitignored } from '../core/helpers/env-state.js'

export interface BuildOptions {
  platform: 'android' | 'ios' | 'all'
  env?: string
  profile?: string
  output?: string
  submit?: boolean
  binaryVersion?: string
  skipBuildValidation?: boolean
}

export async function runBuild(options: BuildOptions): Promise<void> {
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

  const profile = options.profile ?? 'production'
  const platform = options.platform ?? 'all'
  const output = options.output ?? 'build'

  const profileWarning = checkProfileAgainstEasJson(cwd, profile)
  if (profileWarning) console.log(chalk.yellow(profileWarning))

  // Advisory, non-blocking build-version dedup check (skipped entirely with
  // --skip-build-validation).
  if (!options.skipBuildValidation) {
    const resolvedVersion = resolveAppVersion(cwd)
    if (resolvedVersion) {
      const state = await readBuiltVersions(cwd)
      if (hasBuiltVersion(state, resolvedVersion, platform)) {
        console.log(
          chalk.yellow(
            `  Warning: version ${resolvedVersion} (${platform}) has already been built before. Pass --skip-build-validation to force a rebuild without this warning.`
          )
        )
      }
    } else {
      console.log(chalk.gray('  Could not determine app version — skipping build-dedup check.'))
    }
  }

  const envFile = `.env.${targetEnv.name}`
  const envFilePath = join(cwd, envFile)
  const priorAppEnv = process.env.APP_ENV

  try {
    if (existsSync(envFilePath)) {
      dotenv.config({ path: envFilePath, override: true })
    } else {
      console.log(chalk.gray(`  No ${envFile} file found — continuing without it.`))
    }
    process.env.APP_ENV = targetEnv.name

    console.log(
      renderHeader({
        command: 'build',
        platform,
        profile,
        envName: targetEnv.name,
        envFile,
      })
    )

    if (options.binaryVersion) {
      console.log(
        chalk.gray(
          `  --binary-version ${options.binaryVersion} set — skipping local build step, reusing existing binary.`
        )
      )
    } else {
      const buildArgs = buildEasBuildArgs({ platform, profile, output })
      const buildResult = await runWithRepaint({
        args: buildArgs,
        header: renderHeader({
          command: 'build',
          platform,
          profile,
          envName: targetEnv.name,
          envFile,
        }),
        logPrefix: 'rn-firebase-build',
      })

      if (buildResult.exitCode !== 0) {
        process.exitCode = 1
        return
      }

      // Record the successful build for dedup purposes (advisory only, no git ops).
      const resolvedVersion = resolveAppVersion(cwd)
      if (resolvedVersion) {
        const state = await readBuiltVersions(cwd)
        const updated = addBuiltVersion(state, resolvedVersion, platform)
        await writeBuiltVersions(cwd, updated)
        try {
          await ensureStateGitignored(cwd)
        } catch {
          // best-effort — do not fail the build if .gitignore can't be updated
        }
      }

      console.log(chalk.bold.green('\n  Build completed successfully.'))
    }

    if (options.submit) {
      const submitArgs = buildEasSubmitArgs({
        platform,
        profile,
        output,
        binaryVersion: options.binaryVersion,
      })
      const submitResult = await runWithRepaint({
        args: submitArgs,
        header: renderHeader({
          command: 'submit',
          platform,
          profile,
          envName: targetEnv.name,
          envFile,
        }),
        logPrefix: 'rn-firebase-build-submit',
      })

      if (submitResult.exitCode !== 0) {
        process.exitCode = 1
        return
      }

      console.log(chalk.bold.green('\n  Submit completed successfully.'))
    }
  } finally {
    // Restore prior process.env.APP_ENV state — dotenv mutates process-wide
    // state, and runBuild may be called more than once in-process.
    if (priorAppEnv === undefined) {
      delete process.env.APP_ENV
    } else {
      process.env.APP_ENV = priorAppEnv
    }
  }
}
