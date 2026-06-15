import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import type { ConfigExt } from '../../types.js'

export function detectConfigExtension(cwd: string): ConfigExt {
  if (existsSync(join(cwd, 'tsconfig.json'))) return 'ts'

  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { type?: string }
      if (pkg.type === 'module') return 'mjs'
      return 'js'
    } catch {
      // ignore parse errors
    }
  }

  return 'js'
}
