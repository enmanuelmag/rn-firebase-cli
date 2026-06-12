import { existsSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

import type { RNFConfig } from '../../types.js'

export async function loadConfig(cwd: string): Promise<RNFConfig | null> {
  const candidates = [
    'rn-firebase.config.ts',
    'rn-firebase.config.mjs',
    'rn-firebase.config.cjs',
    'rn-firebase.config.js',
  ]

  for (const name of candidates) {
    const full = join(cwd, name)
    if (!existsSync(full)) continue

    const mod = (await import(pathToFileURL(full).href)) as { default?: RNFConfig }
    return mod.default ?? null
  }

  return null
}

export function configFileName(ext: 'ts' | 'mjs' | 'cjs'): string {
  return `rn-firebase.config.${ext}`
}
