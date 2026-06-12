import type { MaterializeParams, ProjectType } from '../../types.js'
import { ExpoMaterializer } from './expo.js'
import { BareRNMaterializer } from './bare-rn.js'

export interface RNMaterializer {
  detectBundleIds(cwd: string): Promise<{ android?: string; ios?: string }>

  build(params: MaterializeParams): Promise<void>

  writeConfigFiles(params: MaterializeParams): Promise<void>
  updateAppConfig(params: MaterializeParams): Promise<void>
  writeFirebaseConfig(params: MaterializeParams): Promise<void>
  updateGitignore(cwd: string, outDir: string): Promise<void>
}

export function getMaterializer(type: ProjectType): RNMaterializer {
  switch (type) {
    case 'expo':
      return new ExpoMaterializer()
    case 'bare':
      return new BareRNMaterializer()
  }
}

export { ExpoMaterializer, BareRNMaterializer }
