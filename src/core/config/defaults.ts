import type { FirebaseEnv, Platform, RNFConfig } from '../../types.js'

export function applyConfigDefaults(params: {
  platform: Platform
  outDir?: string
  envs: FirebaseEnv[]
}): RNFConfig {
  return {
    platform: params.platform,
    outDir: params.outDir ?? 'keys',
    envs: params.envs,
  }
}
