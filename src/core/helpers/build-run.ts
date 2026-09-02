import { existsSync, readFileSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import chalk from 'chalk'
import { execa } from 'execa'

export type BuildPlatform = 'android' | 'ios' | 'all'

export interface BuildArgsParams {
  platform: BuildPlatform
  profile: string
  output: string
}

export interface SubmitArgsParams {
  platform: BuildPlatform
  profile: string
  output: string
  /**
   * Reuse an existing binary instead of the artifact produced by the build
   * step. `'latest'` maps to `eas submit --latest`; any other value is
   * treated as a specific build id passed via `eas submit --id <value>`.
   * When set, `--path`/`--local` are omitted since no local artifact is
   * produced/consumed.
   */
  binaryVersion?: string
}

export interface EasUpdateArgsParams {
  branch: string
  message: string
}

/**
 * Pure command-array builder for `eas build --local`. No spawning, no
 * process side effects — safe to unit test directly.
 */
export function buildEasBuildArgs(params: BuildArgsParams): string[] {
  return [
    'build',
    '--platform',
    params.platform,
    '--profile',
    params.profile,
    '--local',
    '--output',
    params.output,
    '--non-interactive',
  ]
}

/**
 * Pure command-array builder for `eas submit --local`. No spawning, no
 * process side effects — safe to unit test directly.
 */
export function buildEasSubmitArgs(params: SubmitArgsParams): string[] {
  if (params.binaryVersion) {
    return [
      'submit',
      '--platform',
      params.platform,
      '--profile',
      params.profile,
      ...(params.binaryVersion === 'latest' ? ['--latest'] : ['--id', params.binaryVersion]),
      '--non-interactive',
    ]
  }

  return [
    'submit',
    '--platform',
    params.platform,
    '--profile',
    params.profile,
    '--path',
    params.output,
    '--non-interactive',
  ]
}

export interface ResolveArtifactOutputParams {
  baseOutput: string
  platform: 'android' | 'ios'
  appName: string
  version: string
  profile: string
  env: string
}

/**
 * Pure, spawn-free resolver for a single platform's artifact output path.
 * Scopes the artifact under a per-platform subfolder and gives it a
 * versioned filename, e.g.:
 *   `<baseOutput>/ios/<appName>-<version>-<profile>-<env>.ipa`
 *   `<baseOutput>/android/<appName>-<version>-<profile>-<env>.aab`
 *
 * Never accepts `'all'` as `platform` — callers must resolve `'all'` into
 * two separate `'ios'`/`'android'` calls, since a single artifact path can
 * only ever have one file extension. No fs/process side effects — safe to
 * unit test directly.
 */
export function resolveArtifactOutput(params: ResolveArtifactOutputParams): string {
  const extension = params.platform === 'ios' ? 'ipa' : 'aab'
  const filename = `${params.appName}-${params.version}-${params.profile}-${params.env}.${extension}`
  return join(params.baseOutput, params.platform, filename)
}

/**
 * Pure command-array builder for `eas update`. Branch defaults to the
 * `--profile` value (see task 23 design decision — no separate `--branch`
 * flag in v1).
 */
export function buildEasUpdateArgs(params: EasUpdateArgsParams): string[] {
  return ['update', '--branch', params.branch, '--message', params.message, '--non-interactive']
}

/**
 * Strips carriage-return-only line overwrites and splits into clean lines,
 * so ANSI/CR-heavy output from native toolchains (Gradle/Xcodebuild) does
 * not corrupt the rolling tail. Pure — no I/O.
 */
export function splitOutputLines(output: string): string[] {
  return output
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line, index, arr) => !(line === '' && index === arr.length - 1))
}

/** Renders the last `max` lines of `lines` as a single string, pure/testable. */
export function renderTail(lines: string[], max: number): string {
  return lines.slice(Math.max(0, lines.length - max)).join('\n')
}

/**
 * Renders the persistent fixed header shown above the rolling tail.
 * Pure — no I/O, no process.stdout writes.
 */
export function renderHeader(params: {
  command: string
  platform: string
  profile: string
  envName?: string
  envFile?: string
}): string {
  const lines = [
    chalk.bold(`  rn-firebase ${params.command} (local build)`),
    chalk.gray(`  platform: ${params.platform}  profile: ${params.profile}`),
  ]
  if (params.envName) {
    lines.push(
      chalk.gray(`  env: ${params.envName}${params.envFile ? ` (loaded ${params.envFile})` : ''}`)
    )
  }
  return lines.join('\n')
}

/**
 * Pure formatter for the failure output: the exact failed command plus the
 * last N lines of combined stdout+stderr. Safe to unit test without a real
 * subprocess.
 */
export function formatFailureTail(command: string[], combinedOutput: string, n = 10): string {
  const lines = splitOutputLines(combinedOutput)
  const tail = renderTail(lines, n)
  return [
    chalk.red(`  Command failed: ${command.join(' ')}`),
    chalk.gray(`  Last ${Math.min(n, lines.length)} line(s) of output:`),
    tail,
  ].join('\n')
}

/**
 * Reads the consumer's `eas.json` (if present) and, when the given profile
 * isn't one of the keys under `build`, returns a non-blocking warning
 * message to print. Returns `undefined` when there's nothing to warn about
 * (no eas.json, malformed eas.json, no build profiles, or the profile is
 * present). Pure/spawn-free and file-read-only — safe to unit test.
 */
export function checkProfileAgainstEasJson(cwd: string, profile: string): string | undefined {
  const easJsonPath = join(cwd, 'eas.json')
  if (!existsSync(easJsonPath)) return undefined

  try {
    const parsed = JSON.parse(readFileSync(easJsonPath, 'utf8')) as {
      build?: Record<string, unknown>
    }
    const profiles = parsed.build ? Object.keys(parsed.build) : []
    if (profiles.length > 0 && !profiles.includes(profile)) {
      return `  Warning: profile "${profile}" was not found in eas.json's "build" profiles (${profiles.join(', ')}). Continuing anyway.`
    }
    return undefined
  } catch {
    return undefined
  }
}

export interface RunWithRepaintResult {
  exitCode: number
  combinedOutput: string
  logFilePath: string
}

/**
 * Spawns `eas <args>` via execa, streaming a fixed header + rolling tail to
 * the terminal, mirroring the full combined output to a log file under
 * os.tmpdir(). This is the only function in this module that performs any
 * spawn/console side effects — the rendering/formatting logic it calls
 * (renderHeader, renderTail, formatFailureTail) is pure and independently
 * testable.
 */
export async function runWithRepaint(params: {
  args: string[]
  header: string
  logPrefix: string
  maxTailLines?: number
  /** CLI binary to spawn (default 'eas'). Lets non-eas CLIs (e.g. xcrun) reuse the same rendering. */
  binary?: string
}): Promise<RunWithRepaintResult> {
  const binary = params.binary ?? 'eas'
  const maxTailLines = params.maxTailLines ?? 20
  const timestamp = Date.now()
  const logFilePath = join(tmpdir(), `${params.logPrefix}-${timestamp}.log`)

  const subprocess = execa(binary, params.args, { all: true, reject: false })

  const chunks: string[] = []

  const repaint = (): void => {
    console.clear()
    console.log(params.header)
    console.log(chalk.gray('  ' + '-'.repeat(40)))
    const lines = splitOutputLines(chunks.join(''))
    console.log(renderTail(lines, maxTailLines))
  }

  subprocess.all?.on('data', (chunk: Buffer) => {
    chunks.push(chunk.toString())
    repaint()
  })

  const result = await subprocess
  const combinedOutput = result.all ?? chunks.join('')

  try {
    await appendFile(logFilePath, combinedOutput, 'utf8')
  } catch {
    // best-effort — do not fail the command because the log file couldn't be written
  }

  const exitCode = result.exitCode ?? (result.failed ? 1 : 0)

  if (exitCode !== 0) {
    console.log(formatFailureTail([binary, ...params.args], combinedOutput))
  }

  console.log(chalk.gray(`\n  Full log: ${logFilePath}`))

  return { exitCode, combinedOutput, logFilePath }
}
