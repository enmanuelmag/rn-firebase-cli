/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // scope is required: feat(auth): ... not just feat: ...
    'scope-empty': [2, 'never'],

    // 100 char limit on the full subject line
    'header-max-length': [2, 'always', 200],

    // allowed types (action)
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'refactor',
        'docs',
        'test',
        'perf',
        'style',
        'build',
        'ci',
        'revert',
      ],
    ],

    // enforce lowercase on type and scope
    'type-case': [2, 'always', 'lower-case'],
    'scope-case': [2, 'always', 'lower-case'],

    // subject must not be empty and not end with a period
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
  },
}
