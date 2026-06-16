import chalk from 'chalk'

/**
 * Build the lines for the post-Auth-enable reminder box.
 *
 * Shown when Authentication ends up active for the project (either it was
 * already enabled, or it was newly selected during this `init` run). The
 * message:
 *  - Links to the project-specific Auth providers page in the Firebase console.
 *  - Explains that the REVERSED_CLIENT_ID needed for native sign-in flows
 *    may only be added to the config files once a sign-in provider is
 *    enabled, so the native config files must be re-downloaded afterward.
 *  - Tells the user exactly how to re-trigger that download (`rn-firebase update`).
 *
 * Pure function (no console output) so it can be unit-tested directly;
 * callers should pass the returned lines to `drawBox()`.
 */
export function buildAuthReminderLines(projectId: string): string[] {
  const consoleLink = `https://console.firebase.google.com/project/${projectId}/authentication/providers`

  return [
    `  ${chalk.bold.yellow('Action required: enable an Auth sign-in provider')}  `,
    '  ',
    '  Activate a sign-in provider (email/password, Google, etc.) here:  ',
    `  ${chalk.cyan(consoleLink)}  `,
    '  ',
    '  After enabling a provider, re-download your native config files —  ',
    '  the REVERSED_CLIENT_ID needed for sign-in may only be added to  ',
    '  GoogleService-Info.plist (iOS) / google-services.json (Android)  ',
    '  once a provider is enabled.  ',
    '  ',
    `  Run ${chalk.bold('rn-firebase update')} to re-download the latest config files.  `,
  ]
}
