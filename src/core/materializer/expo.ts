import chalk from 'chalk'
import { existsSync, readFileSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { ensureDir, outputFile } from 'fs-extra'
import { join } from 'path'

import {
  generateEnvContent,
  parseFirebaseVarsFromAndroid,
  writeEnvFile,
} from '../../utils/envFile.js'
import { firebaseConfigCjs, firebaseConfigMjs, firebaseConfigTs } from '../config/templates.js'
import { detectBundleIdFromAppJson, detectPackageNameFromAppJson } from '../detector/bundle-ids.js'

import type { MaterializeParams } from '../../types.js'
import type { RNMaterializer } from './index.js'

export class ExpoMaterializer implements RNMaterializer {
  async detectBundleIds(cwd: string): Promise<{ android?: string; ios?: string }> {
    const appJsonPath = join(cwd, 'app.json')
    if (existsSync(appJsonPath)) {
      const parsed = JSON.parse(readFileSync(appJsonPath, 'utf-8')) as Record<string, unknown>
      return {
        android: detectPackageNameFromAppJson(parsed) ?? undefined,
        ios: detectBundleIdFromAppJson(parsed) ?? undefined,
      }
    }

    // app.config.js or app.config.ts — cannot parse statically
    if (existsSync(join(cwd, 'app.config.js')) || existsSync(join(cwd, 'app.config.ts'))) {
      console.log(
        chalk.yellow('  ⚠ Dynamic app.config found — bundle IDs must be entered manually.')
      )
    }

    return {}
  }

  async build(params: MaterializeParams): Promise<void> {
    await this.writeConfigFiles(params)
    await this.updateAppConfig(params)
    await this.writeFirebaseConfig(params)
    await this.writeEnvFile(params)
    if (!params.skipGitignore) {
      await this.updateGitignore(params.cwd, params.config.outDir)
    }
  }

  async writeEnvFile(params: MaterializeParams): Promise<void> {
    const { cwd, env, androidConfigRaw } = params

    const vars = androidConfigRaw ? parseFirebaseVarsFromAndroid(androidConfigRaw) : {}
    const content = generateEnvContent(vars, 'expo')

    if (!content) return

    await writeEnvFile(cwd, env.name, content)
    console.log(chalk.green(`  ✔ Written: .env.${env.name}`))
  }

  async writeConfigFiles(params: MaterializeParams): Promise<void> {
    const { cwd, config, androidConfigRaw, iosConfigRaw } = params
    const outDir = join(cwd, config.outDir)
    await ensureDir(outDir)

    if (androidConfigRaw) {
      await outputFile(join(outDir, 'google-services.json'), androidConfigRaw)
      console.log(chalk.green(`  ✔ Written: ${config.outDir}/google-services.json`))
    }

    if (iosConfigRaw) {
      await outputFile(join(outDir, 'GoogleService-Info.plist'), iosConfigRaw)
      console.log(chalk.green(`  ✔ Written: ${config.outDir}/GoogleService-Info.plist`))
    }
  }

  async updateAppConfig(params: MaterializeParams): Promise<void> {
    const { cwd, config } = params
    const appJsonPath = join(cwd, 'app.json')

    if (existsSync(appJsonPath)) {
      const raw = readFileSync(appJsonPath, 'utf-8')
      const parsed = JSON.parse(raw) as { expo?: Record<string, unknown> }

      if (!parsed.expo) parsed.expo = {}

      if (config.platform === 'android' || config.platform === 'both') {
        parsed.expo.android = {
          ...(parsed.expo.android as object | undefined),
          googleServicesFile: `./${config.outDir}/google-services.json`,
        }
      }

      if (config.platform === 'ios' || config.platform === 'both') {
        parsed.expo.ios = {
          ...(parsed.expo.ios as object | undefined),
          googleServicesFile: `./${config.outDir}/GoogleService-Info.plist`,
        }
      }

      await writeFile(appJsonPath, JSON.stringify(parsed, null, 2) + '\n')
      console.log(chalk.green('  ✔ Updated: app.json (googleServicesFile fields)'))
      return
    }

    // Dynamic config — print instructions
    const configFile = existsSync(join(cwd, 'app.config.ts')) ? 'app.config.ts' : 'app.config.js'

    console.log(
      chalk.yellow(`\n  ℹ Dynamic config detected (${configFile}). Add these fields manually:`)
    )

    if (config.platform === 'android' || config.platform === 'both') {
      console.log(
        chalk.cyan(`
    android: {
      googleServicesFile: './${config.outDir}/google-services.json',
    }`)
      )
    }

    if (config.platform === 'ios' || config.platform === 'both') {
      console.log(
        chalk.cyan(`
    ios: {
      googleServicesFile: './${config.outDir}/GoogleService-Info.plist',
    }`)
      )
    }
  }

  async writeFirebaseConfig(params: MaterializeParams): Promise<void> {
    const { cwd, env, configExt } = params
    const configDir = join(cwd, 'config')
    await ensureDir(configDir)

    const content = {
      webClientIdEnvRef: 'process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID',
      androidPackageName: env.android?.packageName,
      iosBundleId: env.ios?.bundleId,
    }

    const ext = configExt
    const filename = `firebase.config.${ext}`
    const render =
      ext === 'ts'
        ? firebaseConfigTs(content)
        : ext === 'mjs'
          ? firebaseConfigMjs(content)
          : firebaseConfigCjs(content)

    await outputFile(join(configDir, filename), render)
    console.log(chalk.green(`  ✔ Written: config/${filename}`))
  }

  async updateGitignore(cwd: string, outDir: string): Promise<void> {
    const gitignorePath = join(cwd, '.gitignore')
    const entries = [`${outDir}/`, '.env.*']

    let current = ''
    if (existsSync(gitignorePath)) {
      current = await readFile(gitignorePath, 'utf-8')
    }

    let updated = current
    for (const entry of entries) {
      if (updated.split('\n').some((line) => line.trim() === entry)) {
        console.log(chalk.gray(`  · .gitignore already contains ${entry}`))
        continue
      }
      updated = updated.endsWith('\n') ? updated + entry + '\n' : updated + '\n' + entry + '\n'
      console.log(chalk.green(`  ✔ Updated: .gitignore (added ${entry})`))
    }

    if (updated !== current) {
      await writeFile(gitignorePath, updated)
    }
  }
}
