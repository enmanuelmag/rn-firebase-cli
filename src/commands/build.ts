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
  resolveArtifactOutput,
  runWithRepaint,
} from '../core/helpers/build-run.js'
import {
  addBuiltVersion,
  hasBuiltVersion,
  readBuiltVersions,
  resolveAppName,
  resolveAppVersion,
  writeBuiltVersions,
} from '../core/helpers/built-versions.js'
import { ensureStateGitignored } from '../core/helpers/env-state.js'
import { runLocalSubmit } from '../core/submit/index.js'

export interface BuildOptions {
  platform: 'android' | 'ios' | 'all'
  env?: string
  profile?: string
  output?: string
  submit?: boolean
  binaryVersion?: string
  skipBuildValidation?: boolean
  /** Submit mode: 'eas' (default, `eas submit --local`) or 'local' (per-platform local submit). */
  submitMode?: 'eas' | 'local'
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

  // 'all' is resolved into two independent per-platform runs (own output
  // subfolder + own versioned filename) so ios/android artifacts never
  // collide on the same path — see task 26.
  const platforms: Array<'ios' | 'android'> = platform === 'all' ? ['ios', 'android'] : [platform]

  // Local submit consumes the freshly built local artifact, so EAS build ids
  // (--binary-version) are meaningless in local mode. Reject early, before any
  // env-load/build side effects, regardless of whether --submit is set.
  if (options.submitMode === 'local' && options.binaryVersion) {
    console.error(
      chalk.red(
        '  --binary-version is not supported with --submit-mode local — EAS build ids do not apply to local artifacts.'
      )
    )
    process.exit(1)
  }

  const profileWarning = checkProfileAgainstEasJson(cwd, profile)
  if (profileWarning) console.log(chalk.yellow(profileWarning))

  // Advisory, non-blocking build-version dedup check (skipped entirely with
  // --skip-build-validation). Checked per resolved platform so 'all' warns
  // independently for ios/android, consistent with how builds are recorded.
  if (!options.skipBuildValidation) {
    const resolvedVersion = resolveAppVersion(cwd)
    if (resolvedVersion) {
      const state = await readBuiltVersions(cwd)
      for (const p of platforms) {
        if (hasBuiltVersion(state, resolvedVersion, p)) {
          console.log(
            chalk.yellow(
              `  Warning: version ${resolvedVersion} (${p}) has already been built before. Pass --skip-build-validation to force a rebuild without this warning.`
            )
          )
        }
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

    // Per-platform loop: for a single platform this runs once; for 'all' it
    // runs independently for ios then android, each with its own resolved
    // artifact path so the two never share a literal output location. A
    // failure on any platform stops the whole command immediately (matching
    // the prior single-platform behavior) rather than silently continuing
    // to the next platform with a non-zero exit code already set — this
    // keeps failure semantics obvious rather than partially-successful.
    for (const p of platforms) {
      let artifactOutput = ''

      if (options.binaryVersion) {
        console.log(
          chalk.gray(
            `  --binary-version ${options.binaryVersion} set — skipping local build step for ${p}, reusing existing binary.`
          )
        )
      } else {
        const resolvedVersion = resolveAppVersion(cwd)
        const appName = resolveAppName(cwd)
        artifactOutput = resolveArtifactOutput({
          baseOutput: output,
          platform: p,
          appName,
          version: resolvedVersion ?? 'unversioned',
          profile,
          env: targetEnv.name,
        })

        const buildArgs = buildEasBuildArgs({ platform: p, profile, output: artifactOutput })
        const buildResult = await runWithRepaint({
          args: buildArgs,
          header: renderHeader({
            command: 'build',
            platform: p,
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
        if (resolvedVersion) {
          const state = await readBuiltVersions(cwd)
          const updated = addBuiltVersion(state, resolvedVersion, p)
          await writeBuiltVersions(cwd, updated)
          try {
            await ensureStateGitignored(cwd)
          } catch {
            // best-effort — do not fail the build if .gitignore can't be updated
          }
        }

        console.log(chalk.bold.green(`\n  Build completed successfully (${p}).`))
      }

      if (options.submit) {
        if (options.submitMode === 'local') {
          // Local (non-EAS) submit seam — not implemented yet (task 1 foundation).
          // The seam throws LocalSubmitNotImplementedError; catch it and convert
          // to a clean non-zero exit (mirroring the EAS submit failure path below)
          // so it never becomes an unhandled rejection in commander's .action.
          // --binary-version is rejected early in local mode, so artifactOutput
          // is always a freshly resolved, non-empty local artifact path here.
          try {
            await runLocalSubmit({ platform: p, artifactPath: artifactOutput, profile })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(chalk.red(`  ${message}`))
            process.exitCode = 1
            return
          }

          console.log(chalk.bold.green(`\n  Submit completed successfully (${p}).`))
        } else {
          // artifactOutput is '' when --binary-version is set — buildEasSubmitArgs
          // ignores `output` entirely in that branch (no --path/--local emitted),
          // so an empty string is never actually used.
          const submitArgs = buildEasSubmitArgs({
            platform: p,
            profile,
            output: artifactOutput,
            binaryVersion: options.binaryVersion,
          })
          const submitResult = await runWithRepaint({
            args: submitArgs,
            header: renderHeader({
              command: 'submit',
              platform: p,
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

          console.log(chalk.bold.green(`\n  Submit completed successfully (${p}).`))
        }
      }
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
