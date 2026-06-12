import chalk from 'chalk'

/** Strip ANSI escape codes for width calculation */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '')
}

/** Draw a bordered box matching printUpdateMessage() style */
export function drawBox(lines: string[]): void {
  // Calculate max content width (excluding ANSI codes)
  const width = Math.max(...lines.map((l) => stripAnsi(l).length))
  const border = '─'.repeat(width)

  console.log(chalk.yellow(`┌${border}┐`))
  for (const line of lines) {
    const pad = width - stripAnsi(line).length
    const padStr = pad > 0 ? ' '.repeat(pad) : ''
    console.log(chalk.yellow('│') + line + padStr + chalk.yellow('│'))
  }
  console.log(chalk.yellow(`└${border}┘`))
}

/**
 * Print a pretty welcome message when user executes the init command.
 * Styled to match the existing printUpdateMessage() aesthetic.
 */
export function printWelcomeMessage(projectName: string): void {
  const sep = '─'.repeat(38)

  // Build lines with embedded ANSI codes for width calculation
  const lines: string[] = [
    `  ${chalk.bold(chalk.white('agent-harness-kit'))}  `,
    `  ${chalk.gray('—')} harness scaffolding ${chalk.gray('—')}  `,
    `  ${chalk.gray(sep)}  `,
    `  ${chalk.bold('Project:')}  ${projectName || '—'}  `,
    `  ${chalk.bold('Status:')}   ${chalk.green('ready to configure')}  `,
    `  ${chalk.gray(sep)}  `,
    `  ${chalk.gray('Next steps:')}  `,
    `  ${chalk.gray('→')} ${chalk.gray('Set up your AI provider config')}  `,
    `  ${chalk.gray('→')} ${chalk.gray('Run your health check to verify')}  `,
    `  ${chalk.gray('→')} ${chalk.gray('Start adding tasks for your agents')}  `,
  ]

  console.log()
  drawBox(lines)
  console.log()
}
