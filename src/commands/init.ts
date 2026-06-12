import chalk from 'chalk'
import { existsSync, readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import inquirer from 'inquirer'
import ora from 'ora'
import { join } from 'path'

import { generateAppConfigTs } from '../core/config/app-config-template.js'
import { applyConfigDefaults } from '../core/config/defaults.js'
import { configFileName, loadConfig } from '../core/config/load.js'
import { configCjs, configMjs, configTs } from '../core/config/templates.js'
import { detectConfigExtension, detectProjectType } from '../core/detector/index.js'
import {
  createAndroidApp,
  createIOSApp,
  listAndroidApps,
  listIOSApps,
} from '../core/firebase/apps.js'
import { checkFirebaseToolsInstalled, ensureAuth } from '../core/firebase/auth.js'
import { downloadAndroidConfig, downloadIOSConfig } from '../core/firebase/config-download.js'
import { listProjects } from '../core/firebase/projects.js'
import { extractWebClientId } from '../core/firebase/web-client.js'
import { getMaterializer } from '../core/materializer/index.js'
import { buildUsageHint } from '../utils/envFile.js'

import type { FirebaseEnv, Platform } from '../types.js'

export interface InitOptions {
  project?: string
  platform?: Platform
  out?: string
  gitignore: boolean
}

export async function runInit(options: InitOptions): Promise<void> {
  const cwd = process.cwd()

  // 1. Check firebase-tools
  const spinner = ora('Checking firebase-tools...').start()
  try {
    await checkFirebaseToolsInstalled()
    spinner.succeed('firebase-tools found')
  } catch (err) {
    spinner.fail()
    console.error((err as Error).message)
    process.exit(1)
  }

  // 2. Ensure auth
  const authSpinner = ora('Checking Firebase auth...').start()
  try {
    await ensureAuth()
    authSpinner.succeed('Authenticated with Firebase')
  } catch {
    authSpinner.fail('Firebase auth failed')
    process.exit(1)
  }

  // 3. Detect project type
  const projectType = detectProjectType(cwd)
  const resolvedType =
    projectType ??
    (
      await inquirer.prompt<{ type: 'expo' | 'bare' }>([
        {
          type: 'list',
          name: 'type',
          message: 'Could not detect project type. Select:',
          choices: [
            { name: 'Expo (managed or bare with app.json)', value: 'expo' },
            { name: 'Bare React Native', value: 'bare' },
          ],
        },
      ])
    ).type

  console.log(chalk.cyan(`\n  Project type: ${resolvedType}`))

  const materializer = getMaterializer(resolvedType)

  // 4. Detect bundle IDs
  let bundleIds = await materializer.detectBundleIds(cwd)

  const platform: Platform =
    options.platform ??
    (
      await inquirer.prompt<{ platform: Platform }>([
        {
          type: 'list',
          name: 'platform',
          message: 'Which platforms to configure?',
          choices: [
            { name: 'Both (Android + iOS)', value: 'both' },
            { name: 'Android only', value: 'android' },
            { name: 'iOS only', value: 'ios' },
          ],
        },
      ])
    ).platform

  if ((platform === 'android' || platform === 'both') && !bundleIds.android) {
    const { packageName } = await inquirer.prompt<{ packageName: string }>([
      {
        type: 'input',
        name: 'packageName',
        message: 'Android package name (e.g. com.myapp):',
        validate: (v) => v.length > 0 || 'Required',
      },
    ])
    bundleIds = { ...bundleIds, android: packageName }
  }

  if ((platform === 'ios' || platform === 'both') && !bundleIds.ios) {
    const { bundleId } = await inquirer.prompt<{ bundleId: string }>([
      {
        type: 'input',
        name: 'bundleId',
        message: 'iOS bundle identifier (e.g. com.myapp):',
        validate: (v) => v.length > 0 || 'Required',
      },
    ])
    bundleIds = { ...bundleIds, ios: bundleId }
  }

  // 5. Select Firebase project
  const projectsSpinner = ora('Fetching Firebase projects...').start()
  const projects = await listProjects()
  projectsSpinner.succeed(`Found ${projects.length} Firebase project(s)`)

  let selectedProjectId = options.project
  if (!selectedProjectId) {
    const { projectId } = await inquirer.prompt<{ projectId: string }>([
      {
        type: 'list',
        loop: false,
        pageSize: 10,
        name: 'projectId',
        message: 'Select a Firebase project:',
        choices: projects.map((p) => ({
          name: `${p.displayName} (${p.projectId})`,
          value: p.projectId,
        })),
      },
    ])
    selectedProjectId = projectId
  }

  // 6. Env name
  const { envName } = await inquirer.prompt<{ envName: string }>([
    {
      type: 'list',
      name: 'envName',
      message: 'Which environment is this project for?',
      choices: [
        { name: 'dev', value: 'dev' },
        { name: 'staging', value: 'staging' },
        { name: 'prod', value: 'prod' },
        { name: 'Custom...', value: '__custom__' },
      ],
    },
  ])

  let resolvedEnvName = envName
  if (envName === '__custom__') {
    const { custom } = await inquirer.prompt<{ custom: string }>([
      {
        type: 'input',
        name: 'custom',
        message: 'Environment name:',
        validate: (v) => v.length > 0 || 'Required',
      },
    ])
    resolvedEnvName = custom
  }

  const outDir = options.out ?? 'keys'

  // 7. Check apps exist
  const appsSpinner = ora('Checking Firebase apps...').start()
  let androidAppId: string | undefined
  let iosAppId: string | undefined

  const missingAndroidApp =
    `\n  > Please create an Android app in Firebase Console:\n` +
    `  https://console.firebase.google.com/project/${selectedProjectId}/settings/general\n` +
    `  Make sure the package name is: ${chalk.bold(bundleIds.android)}\n`

  const missingIOSApp =
    `\n  > Please create an iOS app in Firebase Console:\n` +
    `  https://console.firebase.google.com/project/${selectedProjectId}/settings/general\n` +
    `  Make sure the bundle ID is: ${chalk.bold(bundleIds.ios)}\n`

  if (platform === 'android' || platform === 'both') {
    const androidApps = await listAndroidApps(selectedProjectId)
    const matched = androidApps.find((a) => a.packageName === bundleIds.android)
    if (matched) {
      androidAppId = matched.appId
    } else {
      appsSpinner.warn(
        `No Android app found with package name "${bundleIds.android}" in project "${selectedProjectId}".`
      )
      const { createAndroid } = await inquirer.prompt<{ createAndroid: boolean }>([
        {
          type: 'confirm',
          name: 'createAndroid',
          message: `Create Android app with package name "${bundleIds.android}" in project "${selectedProjectId}"?`,
          default: true,
        },
      ])
      if (createAndroid) {
        const { androidDisplayName } = await inquirer.prompt<{ androidDisplayName: string }>([
          {
            type: 'input',
            name: 'androidDisplayName',
            message: 'Display name for the new app (optional, press Enter to skip):',
          },
        ])
        const createSpinner = ora('Creating Android app in Firebase...').start()
        try {
          androidAppId = await createAndroidApp(
            selectedProjectId,
            bundleIds.android!,
            androidDisplayName || undefined
          )
          createSpinner.succeed(`Android app created (${androidAppId})`)
        } catch (err) {
          createSpinner.fail((err as Error).message)
          process.exit(1)
        }
      } else {
        console.log(chalk.yellow(missingAndroidApp))
        process.exit(1)
      }
    }
  }

  if (platform === 'ios' || platform === 'both') {
    const iosApps = await listIOSApps(selectedProjectId)
    const matched = iosApps.find((a) => a.bundleId === bundleIds.ios)
    if (matched) {
      iosAppId = matched.appId
    } else {
      appsSpinner.warn(
        `No iOS app found with bundle ID "${bundleIds.ios}" in project "${selectedProjectId}".`
      )
      const { createIOS } = await inquirer.prompt<{ createIOS: boolean }>([
        {
          type: 'confirm',
          name: 'createIOS',
          message: `Create iOS app with bundle ID "${bundleIds.ios}" in project "${selectedProjectId}"?`,
          default: true,
        },
      ])
      if (createIOS) {
        const { iosDisplayName } = await inquirer.prompt<{ iosDisplayName: string }>([
          {
            type: 'input',
            name: 'iosDisplayName',
            message: 'Display name for the new app (optional, press Enter to skip):',
          },
        ])
        const createSpinner = ora('Creating iOS app in Firebase...').start()
        try {
          iosAppId = await createIOSApp(
            selectedProjectId,
            bundleIds.ios!,
            iosDisplayName || undefined
          )
          createSpinner.succeed(`iOS app created (${iosAppId})`)
        } catch (err) {
          createSpinner.fail((err as Error).message)
          process.exit(1)
        }
      } else {
        console.log(chalk.yellow(missingIOSApp))
        process.exit(1)
      }
    }
  }

  appsSpinner.succeed('Firebase apps verified')

  // 8. Download configs
  let androidConfigRaw: string | undefined
  let iosConfigRaw: string | undefined

  const downloadSpinner = ora('Downloading Firebase config files...').start()

  if (androidAppId) {
    androidConfigRaw = await downloadAndroidConfig(selectedProjectId, androidAppId)
  }
  if (iosAppId) {
    iosConfigRaw = await downloadIOSConfig(selectedProjectId, iosAppId)
  }

  downloadSpinner.succeed('Config files downloaded')

  // 9. Extract webClientId
  const webClientId = androidConfigRaw ? extractWebClientId(androidConfigRaw) : undefined

  // 10. Build env object
  const env: FirebaseEnv = {
    name: resolvedEnvName,
    googleCloudProjectId: selectedProjectId,
    firebaseProjectId: selectedProjectId,
    android: bundleIds.android ? { packageName: bundleIds.android } : undefined,
    ios: bundleIds.ios ? { bundleId: bundleIds.ios } : undefined,
  }

  const config = applyConfigDefaults({ platform, outDir, envs: [env] })
  const configExt = detectConfigExtension(cwd)

  // 11. Materialize
  console.log(chalk.bold('\n  Writing files...'))

  const materializeParams = {
    cwd,
    config,
    env,
    androidConfigRaw,
    iosConfigRaw,
    webClientId,
    configExt,
  }

  await materializer.build({
    ...materializeParams,
    skipGitignore: !options.gitignore,
  })

  // 11b. Usage hint
  console.log()
  console.log(buildUsageHint(resolvedType, resolvedEnvName))
  console.log()

  // 12. Write rn-firebase.config.*
  const cfgName = configFileName(configExt)
  const cfgContent =
    configExt === 'ts'
      ? configTs(config)
      : configExt === 'mjs'
        ? configMjs(config)
        : configCjs(config)

  await writeFile(join(cwd, cfgName), cfgContent)
  console.log(chalk.green(`  ✔ Written: ${cfgName}`))

  // 12b. Offer app.config.ts generation for multi-env setups
  if (resolvedType === 'expo') {
    const appJsonPath = join(cwd, 'app.json')
    const appConfigJsExists = existsSync(join(cwd, 'app.config.js'))
    const appConfigTsExists = existsSync(join(cwd, 'app.config.ts'))
    const appConfigExists = appConfigJsExists || appConfigTsExists

    // Check if app.json already has a googleServicesFile (second env scenario)
    let hasExistingGoogleServicesFile = false
    if (existsSync(appJsonPath)) {
      try {
        const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8')) as {
          expo?: {
            android?: { googleServicesFile?: string }
            ios?: { googleServicesFile?: string }
          }
        }
        hasExistingGoogleServicesFile =
          !!appJson.expo?.android?.googleServicesFile || !!appJson.expo?.ios?.googleServicesFile
      } catch {
        // ignore parse errors
      }
    }

    if (hasExistingGoogleServicesFile && !appConfigExists) {
      const { generateAppConfig } = await inquirer.prompt<{ generateAppConfig: boolean }>([
        {
          type: 'confirm',
          name: 'generateAppConfig',
          message:
            'Multiple envs detected. Generate app.config.ts for dynamic Firebase paths (APP_ENV)?',
          default: true,
        },
      ])

      if (generateAppConfig) {
        // Load existing envs from persisted config + add current env
        let allEnvs = [env]
        try {
          const existingConfig = await loadConfig(cwd)
          if (existingConfig) {
            const others = existingConfig.envs.filter((e) => e.name !== env.name)
            allEnvs = [...others, env]
          }
        } catch {
          // first run or config not readable — use only current env
        }

        const appConfigContent = generateAppConfigTs({
          envs: allEnvs,
          outDir,
          platform,
        })
        await writeFile(join(cwd, 'app.config.ts'), appConfigContent)
        console.log(chalk.green('  ✔ Written: app.config.ts (multi-env Firebase config)'))
      } else {
        // Print copyable snippet
        console.log(chalk.cyan('\n  💡 Add this pattern to your app.config.ts:\n'))
        console.log(
          chalk.gray(
            generateAppConfigTs({ envs: [env], outDir, platform })
              .split('\n')
              .map((l) => `    ${l}`)
              .join('\n')
          )
        )
      }
    } else if (hasExistingGoogleServicesFile && appConfigExists) {
      const configFile = appConfigTsExists ? 'app.config.ts' : 'app.config.js'
      console.log(
        chalk.yellow(
          `\n  ℹ  ${configFile} already exists — update it manually to add the new env's Firebase paths.`
        )
      )
      console.log(chalk.cyan('\n  💡 Suggested addition to firebaseFiles map:\n'))
      if (platform === 'android' || platform === 'both') {
        console.log(
          chalk.gray(
            `    ${env.name}: { android: './${outDir}/${env.name}-${env.android?.packageName}-google-services.json' },`
          )
        )
      }
      if (platform === 'ios' || platform === 'both') {
        console.log(
          chalk.gray(
            `    ${env.name}: { ios: './${outDir}/${env.name}-${env.ios?.bundleId}-GoogleService-Info.plist' },`
          )
        )
      }
    }
  }

  // 13. Summary
  console.log(chalk.bold.green('\n  ✅ Firebase setup complete!\n'))
  console.log(chalk.gray('  Files created:'))
  if (androidConfigRaw)
    console.log(
      chalk.gray(
        `    · ${outDir}/${env.name}-${env.android?.packageName ?? 'android'}-google-services.json`
      )
    )
  if (iosConfigRaw)
    console.log(
      chalk.gray(
        `    · ${outDir}/${env.name}-${env.ios?.bundleId ?? 'ios'}-GoogleService-Info.plist`
      )
    )
  console.log(chalk.gray(`    · config/firebase.config.${configExt}`))
  console.log(chalk.gray(`    · ${cfgName}`))
  console.log(chalk.gray(`    · .env.${resolvedEnvName}`))
  console.log()
}
