import chalk from 'chalk'

import { drawBox } from '../helpers/cli'

const TIMEOUT_MS = 2500

interface UpdateInfo {
  current: string
  latest: string
  name: string
}

export function checkForUpdate(name: string, currentVersion: string): Promise<UpdateInfo | null> {
  const REGISTRY_URL = `https://registry.npmjs.org/${name}/latest`

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), TIMEOUT_MS)

    fetch(REGISTRY_URL)
      .then((res) => res.json())
      .then((data) => {
        clearTimeout(timer)
        const latest = (data as { version: string }).version
        resolve(isNewer(latest, currentVersion) ? { current: currentVersion, latest, name } : null)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(null)
      })
  })
}

export function printUpdateMessage({ current, latest, name }: UpdateInfo): void {
  const lines = [
    `  Update available ${chalk.dim(current)} → ${chalk.green(latest)}  `,
    `  Run: ${chalk.cyan(`pnpm i ${name}@${latest}`)}          `,
  ]

  drawBox(lines)
}

function isNewer(latest: string, current: string): boolean {
  const toNum = (v: string) => v.split('.').map(Number)
  const [lMaj, lMin, lPat] = toNum(latest)
  const [cMaj, cMin, cPat] = toNum(current)

  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin

  return lPat > cPat
}
