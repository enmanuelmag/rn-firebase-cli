import chalk from 'chalk'
import ora from 'ora'
import { loadConfig } from '../core/config/load.js'
import { checkFirebaseToolsInstalled, ensureAuth } from '../core/firebase/auth.js'
import { listAndroidApps, listIOSApps } from '../core/firebase/apps.js'
import { downloadAndroidConfig, downloadIOSConfig } from '../core/firebase/config-download.js'
import { extractWebClientId } from '../core/firebase/web-client.js'
import { detectProjectType, detectConfigExtension } from '../core/detector/index.js'
import { getMaterializer } from '../core/materializer/index.js'

export interface UpdateOptions {
  env?: string
}

export async function runUpdate(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd()

  const config = await loadConfig(cwd)
  if (!config) {
    console.error(chalk.red('  No rn-firebase.config found. Run rn-firebase init first.'))
    process.exit(1)
  }

  const targetEnv = options.env
    ? config.envs.find((e) => e.name === options.env)
    : config.envs[0]

  if (!targetEnv) {
    console.error(chalk.red(`  Environment "${options.env}" not found in rn-firebase.config.`))
    process.exit(1)
  }

  const spinner = ora('Checking firebase-tools...').start()
  await checkFirebaseToolsInstalled()
  spinner.succeed('firebase-tools found')

  await ensureAuth()

  const projectId = targetEnv.firebaseProjectId ?? targetEnv.googleCloudProjectId
  const projectType = detectProjectType(cwd) ?? 'expo'
  const materializer = getMaterializer(projectType)
  const configExt = detectConfigExtension(cwd)

  let androidConfigRaw: string | undefined
  let iosConfigRaw: string | undefined

  const downloadSpinner = ora('Re-downloading Firebase config files...').start()

  if (config.platform === 'android' || config.platform === 'both') {
    const apps = await listAndroidApps(projectId)
    const matched = apps.find((a) => a.packageName === targetEnv.android?.packageName)
    if (matched) {
      androidConfigRaw = await downloadAndroidConfig(projectId, matched.appId)
    } else {
      downloadSpinner.warn(`Android app not found for package "${targetEnv.android?.packageName}"`)
    }
  }

  if (config.platform === 'ios' || config.platform === 'both') {
    const apps = await listIOSApps(projectId)
    const matched = apps.find((a) => a.bundleId === targetEnv.ios?.bundleId)
    if (matched) {
      iosConfigRaw = await downloadIOSConfig(projectId, matched.appId)
    } else {
      downloadSpinner.warn(`iOS app not found for bundle ID "${targetEnv.ios?.bundleId}"`)
    }
  }

  downloadSpinner.succeed('Config files downloaded')

  const webClientId = androidConfigRaw ? extractWebClientId(androidConfigRaw) : undefined

  await materializer.build({
    cwd,
    config,
    env: targetEnv,
    androidConfigRaw,
    iosConfigRaw,
    webClientId,
    configExt,
  })

  console.log(chalk.bold.green('\n  ✅ Firebase configs updated!\n'))
}
