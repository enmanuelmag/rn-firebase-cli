import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

const sharedRules = {
  'simple-import-sort/imports': [
    'error',
    {
      groups: [
        ['^node:', '^@?\\w'], // node builtins + external packages
        ['^@/'], // internal aliases (@/*)
        ['^\\.'], // relative imports
        ['^.*\\u0000$'], // type imports (last)
      ],
    },
  ],
  'simple-import-sort/exports': 'error',
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-unused-vars': 'off',
  '@typescript-eslint/no-namespace': 'off',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
  ],
}

const globalIgnores = {
  ignores: ['dist/**', 'node_modules/**'],
}

export default tseslint.config(
  globalIgnores,

  // ─── CLI source (src/) ────────────────────────────────────────────────────
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    extends: [...tseslint.configs.recommended],
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: sharedRules,
  },

  // ─── Config & script files ────────────────────────────────────────────────
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    ignores: ['src/**'],
    languageOptions: {
      parser: tseslint.parser,
    },
    extends: [...tseslint.configs.recommended],
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: sharedRules,
  },
)
