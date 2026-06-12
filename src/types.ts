export type Platform = 'android' | 'ios' | 'both'
export type ProjectType = 'expo' | 'bare'
export type ConfigExt = 'ts' | 'mjs' | 'cjs'

export type FirebaseEnv = {
  name: string
  googleCloudProjectId: string
  firebaseProjectId?: string
  android?: { packageName: string }
  ios?: { bundleId: string }
}

export interface RNFConfig {
  platform: Platform
  outDir: string
  envs: FirebaseEnv[]
}

export interface MaterializeParams {
  cwd: string
  config: RNFConfig
  env: FirebaseEnv
  androidConfigRaw?: string
  iosConfigRaw?: string
  webClientId?: string
  configExt: ConfigExt
}

export interface FirebaseProject {
  projectId: string
  displayName: string
}

export interface FirebaseApp {
  appId: string
  displayName?: string
  packageName?: string
  bundleId?: string
}
