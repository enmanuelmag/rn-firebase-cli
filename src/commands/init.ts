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
import { createProject, listProjects } from '../core/firebase/projects.js'
import {
  createDefaultFirestoreDatabase,
  enableServices,
  hasDefaultFirestoreDatabase,
  listEnabledServices,
} from '../core/firebase/services.js'
import { extractWebClientId } from '../core/firebase/web-client.js'
import { buildAuthReminderLines } from '../core/helpers/auth-reminder.js'
import { drawBox } from '../core/helpers/cli.js'
import { cleanAppJsonGoogleServicesFile } from '../core/materializer/expo.js'
import { getMaterializer } from '../core/materializer/index.js'
import { buildUsageHint } from '../utils/envFile.js'
import { injectPackageScripts } from '../utils/packageScripts.js'

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

  // 5. Select or create Firebase project
  let selectedProjectId = options.project
  let isNewProject = false

  if (!selectedProjectId) {
    const { projectChoice } = await inquirer.prompt<{ projectChoice: 'existing' | 'new' }>([
      {
        type: 'list',
        name: 'projectChoice',
        message: 'Would you like to use an existing Firebase project or create a new one?',
        choices: [
          { name: 'Use existing project', value: 'existing' },
          { name: 'Create new project', value: 'new' },
        ],
      },
    ])

    if (projectChoice === 'new') {
      isNewProject = true

      const { displayName } = await inquirer.prompt<{ displayName: string }>([
        {
          type: 'input',
          name: 'displayName',
          message: 'Display name for the new Firebase project:',
          validate: (v) => v.trim().length > 0 || 'Display name is required',
        },
      ])

      const { newProjectId } = await inquirer.prompt<{ newProjectId: string }>([
        {
          type: 'input',
          name: 'newProjectId',
          message: 'Project ID (lowercase letters, digits, hyphens; 6-30 chars):',
          validate: (v) => {
            if (!/^[a-z0-9-]{6,30}$/.test(v)) {
              return 'Must be 6-30 characters: lowercase letters, digits, or hyphens only'
            }
            return true
          },
        },
      ])

      const createProjectSpinner = ora('Creating Firebase project...').start()
      try {
        selectedProjectId = await createProject(displayName.trim(), newProjectId)
        createProjectSpinner.succeed(chalk.green(`Firebase project created: ${selectedProjectId}`))
      } catch (err) {
        createProjectSpinner.fail((err as Error).message)
        process.exit(1)
      }
    } else {
      const projectsSpinner = ora('Fetching Firebase projects...').start()
      const projects = await listProjects()
      projectsSpinner.succeed(`Found ${projects.length} Firebase project(s)`)

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
  }

  // 5b. Service enablement multi-select (skipped in non-interactive mode)
  if (!options.project) {
    const SERVICE_MAP: Record<string, string | string[]> = {
      auth: 'identitytoolkit.googleapis.com',
      firestore: 'firestore.googleapis.com',
      storage: ['firebasestorage.googleapis.com', 'storage.googleapis.com'],
    }

    let enabledServiceApis: string[] = []
    if (!isNewProject) {
      const checkSpinner = ora('Checking enabled Firebase services...').start()
      enabledServiceApis = await listEnabledServices(selectedProjectId!)
      checkSpinner.succeed('Service check complete')
    }

    const authEnabled = enabledServiceApis.includes('identitytoolkit.googleapis.com')
    const firestoreEnabled = enabledServiceApis.includes('firestore.googleapis.com')
    const storageEnabled =
      enabledServiceApis.includes('firebasestorage.googleapis.com') ||
      enabledServiceApis.includes('storage.googleapis.com')

    const serviceChoices = [
      ...(!authEnabled ? [{ name: 'Authentication', value: 'auth' }] : []),
      ...(!firestoreEnabled ? [{ name: 'Cloud Firestore', value: 'firestore' }] : []),
      ...(!storageEnabled ? [{ name: 'Cloud Storage', value: 'storage' }] : []),
    ]

    let servicesToEnable: string[] = []
    if (serviceChoices.length === 0) {
      console.log('  All Firebase services are already enabled.')
    } else {
      const response = await inquirer.prompt<{ servicesToEnable: string[] }>([
        {
          type: 'checkbox',
          name: 'servicesToEnable',
          message: 'Which Firebase services would you like to enable?',
          choices: serviceChoices,
        },
      ])
      servicesToEnable = response.servicesToEnable
    }

    // Disabled items are NOT returned by checkbox — collect APIs for newly selected services only
    const apisToEnable: string[] = []
    if (servicesToEnable.includes('auth')) {
      const api = SERVICE_MAP['auth']
      if (Array.isArray(api)) apisToEnable.push(...api)
      else apisToEnable.push(api)
    }
    if (servicesToEnable.includes('firestore')) {
      const api = SERVICE_MAP['firestore']
      if (Array.isArray(api)) apisToEnable.push(...api)
      else apisToEnable.push(api)
    }
    if (servicesToEnable.includes('storage')) {
      const api = SERVICE_MAP['storage']
      if (Array.isArray(api)) apisToEnable.push(...api)
      else apisToEnable.push(api)
    }

    if (apisToEnable.length > 0) {
      const enableSpinner = ora('Enabling selected Firebase services...').start()
      try {
        await enableServices(selectedProjectId!, apisToEnable)
        enableSpinner.succeed('Firebase services enabled successfully')
      } catch (err) {
        enableSpinner.warn(`Could not enable services automatically: ${(err as Error).message}`)
        console.log(
          chalk.yellow('  You can enable them manually at https://console.firebase.google.com')
        )
      }
    }

    const firestoreWillBeActive = firestoreEnabled || servicesToEnable.includes('firestore')
    if (firestoreWillBeActive) {
      const dbCheckSpinner = ora('Checking for default Firestore database...').start()
      const dbExists = await hasDefaultFirestoreDatabase(selectedProjectId!)
      dbCheckSpinner.succeed(
        dbExists
          ? 'Default Firestore database already exists'
          : 'No default Firestore database found'
      )

      if (!dbExists) {
        const { firestoreLocation } = await inquirer.prompt<{ firestoreLocation: string }>([
          {
            type: 'input',
            name: 'firestoreLocation',
            message: 'Which location should the Firestore database be created in?',
            default: 'nam5',
          },
        ])

        const createDbSpinner = ora('Creating default Firestore database...').start()
        try {
          await createDefaultFirestoreDatabase(selectedProjectId!, firestoreLocation)
          createDbSpinner.succeed(`Default Firestore database created in "${firestoreLocation}"`)
        } catch (err) {
          createDbSpinner.warn(
            `Could not create the default Firestore database automatically: ${(err as Error).message}`
          )
          console.log(
            chalk.yellow('  You can create it manually at https://console.firebase.google.com')
          )
        }
      }
    }

    const authWillBeActive = authEnabled || servicesToEnable.includes('auth')
    if (authWillBeActive) {
      console.log()
      drawBox(buildAuthReminderLines(selectedProjectId!))
      console.log()
    }
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

        // Clean up googleServicesFile from app.json — app.config.ts now owns these fields
        try {
          const cleaned = await cleanAppJsonGoogleServicesFile(cwd)
          if (cleaned) {
            console.log(
              chalk.green(
                '  ✔ Cleaned: app.json (googleServicesFile removed — now managed by app.config.ts)'
              )
            )
          }
        } catch {
          // non-critical — skip silently if app.json can't be parsed
        }
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

      // Step 1 — firebaseFiles map
      console.log(
        chalk.cyan(
          '\n  💡 Step 1 — Define or extend your firebaseFiles map in ' + configFile + ':\n'
        )
      )
      console.log(chalk.gray("    import { dirname, resolve } from 'path'"))
      console.log(chalk.gray("    import { fileURLToPath } from 'url'"))
      console.log(chalk.gray(''))
      console.log(chalk.gray('    const __dirname = dirname(fileURLToPath(import.meta.url))'))
      console.log(chalk.gray(''))
      console.log(
        chalk.gray(
          '    const firebaseFiles: Record<string, { android?: string; ios?: string }> = {'
        )
      )
      console.log(chalk.gray('      // ... your existing entries (if any) ...'))
      console.log(chalk.gray(`      ${env.name}: {`))
      if (platform === 'android' || platform === 'both') {
        console.log(
          chalk.gray(
            `        android: resolve(__dirname, '${outDir}/${env.name}-${env.android?.packageName ?? 'android'}-google-services.json'),`
          )
        )
      }
      if (platform === 'ios' || platform === 'both') {
        console.log(
          chalk.gray(
            `        ios:     resolve(__dirname, '${outDir}/${env.name}-${env.ios?.bundleId ?? 'ios'}-GoogleService-Info.plist'),`
          )
        )
      }
      console.log(chalk.gray('      },'))
      console.log(chalk.gray('    }'))
      console.log(chalk.gray(''))
      console.log(chalk.gray('    // Set this before running Expo:'))
      console.log(chalk.gray('    //   APP_ENV=dev npx expo start'))
      console.log(chalk.gray('    //   APP_ENV=prod eas build --platform all'))
      console.log(chalk.gray(`    const env = process.env.APP_ENV ?? '${env.name}'`))

      // Step 2 — usage in config object
      console.log(chalk.cyan('\n  💡 Step 2 — Use the map in your exported config object:\n'))
      if (platform === 'android' || platform === 'both') {
        console.log(chalk.gray('    android: {'))
        console.log(chalk.gray('      // ...your other android fields...'))
        console.log(chalk.gray('      googleServicesFile: firebaseFiles[env]?.android,'))
        console.log(chalk.gray('    },'))
      }
      if (platform === 'ios' || platform === 'both') {
        console.log(chalk.gray('    ios: {'))
        console.log(chalk.gray('      // ...your other ios fields...'))
        console.log(chalk.gray('      googleServicesFile: firebaseFiles[env]?.ios,'))
        console.log(chalk.gray('    },'))
      }
    }
  }

  // 13. Inject package.json scripts
  await injectPackageScripts(cwd, resolvedEnvName, platform)

  // 14. Summary
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
