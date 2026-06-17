import chalk from 'chalk'
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
import { extractWebClientId } from '../core/firebase/web-client.js'
import { listEnabledServices } from '../core/firebase/services.js'
import { getMaterializer } from '../core/materializer/index.js'
import { buildUsageHint } from '../utils/envFile.js'
import { drawBox } from '../core/helpers/cli.js'
import { buildAuthReminderLines } from '../core/helpers/auth-reminder.js'
import { injectPackageScripts } from '../utils/packageScripts.js'

import type { FirebaseEnv } from '../types.js'
import { existsSync } from 'fs'

export async function runAdd(): Promise<void> {
  const cwd = process.cwd()

  // 1. Load existing config — fail gracefully if missing
  const existingConfig = await loadConfig(cwd)
  if (!existingConfig) {
    console.error(
      chalk.red('  No rn-firebase.config found. Run `rn-firebase init` first.')
    )
    process.exit(1)
  }

  // Extract platform, outDir, and bundle IDs from existing config
  const { platform, outDir = 'keys' } = existingConfig
  const firstEnv = existingConfig.envs[0]
  const bundleIds = {
    android: firstEnv?.android?.packageName,
    ios: firstEnv?.ios?.bundleId,
  }

  // 2. Check firebase-tools
  const spinner = ora('Checking firebase-tools...').start()
  try {
    await checkFirebaseToolsInstalled()
    spinner.succeed('firebase-tools found')
  } catch (err) {
    spinner.fail()
    console.error((err as Error).message)
    process.exit(1)
  }

  // 3. Ensure auth
  const authSpinner = ora('Checking Firebase auth...').start()
  try {
    await ensureAuth()
    authSpinner.succeed('Authenticated with Firebase')
  } catch {
    authSpinner.fail('Firebase auth failed')
    process.exit(1)
  }

  // 4. Select or create Firebase project
  let selectedProjectId: string | undefined

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

  // 5. Env name
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

  // 6. Check / create Firebase apps using bundle IDs from existing config
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
    const androidApps = await listAndroidApps(selectedProjectId!)
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
            selectedProjectId!,
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
    const iosApps = await listIOSApps(selectedProjectId!)
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
            selectedProjectId!,
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

  // 7. Download configs
  let androidConfigRaw: string | undefined
  let iosConfigRaw: string | undefined

  const downloadSpinner = ora('Downloading Firebase config files...').start()

  if (androidAppId) {
    androidConfigRaw = await downloadAndroidConfig(selectedProjectId!, androidAppId)
  }
  if (iosAppId) {
    iosConfigRaw = await downloadIOSConfig(selectedProjectId!, iosAppId)
  }

  downloadSpinner.succeed('Config files downloaded')

  // 8. Extract webClientId
  const webClientId = androidConfigRaw ? extractWebClientId(androidConfigRaw) : undefined

  // 8b. Auth reminder — if Auth is already enabled on this project, warn
  // that the downloaded config files may not yet contain REVERSED_CLIENT_ID
  // and must be re-downloaded after enabling a sign-in provider.
  try {
    const enabledApis = await listEnabledServices(selectedProjectId!)
    if (enabledApis.includes('identitytoolkit.googleapis.com')) {
      console.log()
      drawBox(buildAuthReminderLines(selectedProjectId!))
      console.log()
    }
  } catch {
    // non-blocking — if the service check fails, continue silently
  }

  // 9. Build new env object
  const newEnv: FirebaseEnv = {
    name: resolvedEnvName,
    googleCloudProjectId: selectedProjectId!,
    firebaseProjectId: selectedProjectId!,
    android: bundleIds.android ? { packageName: bundleIds.android } : undefined,
    ios: bundleIds.ios ? { bundleId: bundleIds.ios } : undefined,
  }

  // 10. Merge: replace if same name, otherwise append
  const mergedEnvs = [
    ...existingConfig.envs.filter((e) => e.name !== resolvedEnvName),
    newEnv,
  ]

  // 11. Build merged config and materialize
  const mergedConfig = applyConfigDefaults({
    platform,
    outDir,
    envs: mergedEnvs,
  })

  const configExt = detectConfigExtension(cwd)
  const projectType = detectProjectType(cwd) ?? 'expo'
  const materializer = getMaterializer(projectType)

  console.log(chalk.bold('\n  Writing files...'))

  await materializer.build({
    cwd,
    config: mergedConfig,
    env: newEnv,
    androidConfigRaw,
    iosConfigRaw,
    webClientId,
    configExt,
    skipGitignore: true,
  })

  // 11b. Usage hint
  console.log()
  console.log(buildUsageHint(projectType, resolvedEnvName))
  console.log()

  // 12. Write rn-firebase.config.*
  const cfgName = configFileName(configExt)
  const cfgContent =
    configExt === 'ts'
      ? configTs(mergedConfig)
      : configExt === 'mjs'
        ? configMjs(mergedConfig)
        : configCjs(mergedConfig)

  await writeFile(join(cwd, cfgName), cfgContent)
  console.log(chalk.green(`  ✔ Written: ${cfgName}`))

  // 13. Regenerate app.config.ts if expo and file exists
  if (projectType === 'expo') {
    const appConfigTsPath = join(cwd, 'app.config.ts')
    if (existsSync(appConfigTsPath)) {
      const appConfigContent = generateAppConfigTs({
        envs: mergedEnvs,
        outDir,
        platform,
      })
      await writeFile(appConfigTsPath, appConfigContent)
      console.log(chalk.green('  ✔ Updated: app.config.ts (added new env Firebase paths)'))
    }
  }

  // 14. Inject package.json scripts for the new env
  await injectPackageScripts(cwd, resolvedEnvName, platform)

  // 15. Summary
  console.log(chalk.bold.green('\n  ✅ Firebase environment added!\n'))
  console.log(chalk.gray('  Files created/updated:'))
  if (androidConfigRaw)
    console.log(
      chalk.gray(
        `    · ${outDir}/${newEnv.name}-${newEnv.android?.packageName ?? 'android'}-google-services.json`
      )
    )
  if (iosConfigRaw)
    console.log(
      chalk.gray(
        `    · ${outDir}/${newEnv.name}-${newEnv.ios?.bundleId ?? 'ios'}-GoogleService-Info.plist`
      )
    )
  console.log(chalk.gray(`    · ${cfgName} (${mergedEnvs.length} environment(s) total)`))
  console.log(chalk.gray(`    · .env.${resolvedEnvName}`))
  console.log()
}
