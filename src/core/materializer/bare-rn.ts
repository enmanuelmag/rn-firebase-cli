import chalk from 'chalk'
import type { RNMaterializer } from './index.js'
import type { MaterializeParams } from '../../types.js'
import { detectBundleId, detectPackageName } from '../detector/bundle-ids.js'

export class BareRNMaterializer implements RNMaterializer {
  async detectBundleIds(cwd: string): Promise<{ android?: string; ios?: string }> {
    const [android, ios] = await Promise.all([
      detectPackageName(cwd),
      detectBundleId(cwd),
    ])
    return { android, ios }
  }

  async build(params: MaterializeParams): Promise<void> {
    await this.writeConfigFiles(params)
    await this.updateAppConfig(params)
    await this.writeFirebaseConfig(params)
    await this.updateGitignore(params.cwd, params.config.outDir)
  }

  async writeConfigFiles(_params: MaterializeParams): Promise<void> {
    console.log(chalk.yellow('  ⚠ Bare RN support coming in v2 — skipping writeConfigFiles'))
  }

  async updateAppConfig(_params: MaterializeParams): Promise<void> {
    console.log(chalk.yellow('  ⚠ Bare RN support coming in v2 — skipping updateAppConfig'))
  }

  async writeFirebaseConfig(_params: MaterializeParams): Promise<void> {
    console.log(chalk.yellow('  ⚠ Bare RN support coming in v2 — skipping writeFirebaseConfig'))
  }

  async updateGitignore(_cwd: string, _outDir: string): Promise<void> {
    console.log(chalk.yellow('  ⚠ Bare RN support coming in v2 — skipping updateGitignore'))
  }
}
