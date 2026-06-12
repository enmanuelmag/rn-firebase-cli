# @cardor/rn-firebase-cli

**v0.1.0** — Automated Firebase setup for React Native (Expo & Bare)

[![npm version](https://img.shields.io/npm/v/@cardor/rn-firebase-cli)](https://www.npmjs.com/package/@cardor/rn-firebase-cli)
[![npm downloads](https://img.shields.io/npm/dm/@cardor/rn-firebase-cli)](https://www.npmjs.com/package/@cardor/rn-firebase-cli)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-yellow.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D22.5.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

---

## Table of Contents

- [@cardor/rn-firebase-cli](#cardorrn-firebase-cli)
  - [Table of Contents](#table-of-contents)
  - [What is this?](#what-is-this)
  - [Features](#features)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
    - [Global install (recommended for CLI usage)](#global-install-recommended-for-cli-usage)
    - [Local install (for programmatic types)](#local-install-for-programmatic-types)
  - [Quick Start](#quick-start)
  - [CLI Commands Reference](#cli-commands-reference)
    - [`rn-firebase init`](#rn-firebase-init)
      - [Flags](#flags)
      - [What it does](#what-it-does)
      - [Files created](#files-created)
    - [`rn-firebase status`](#rn-firebase-status)
      - [Flags](#flags-1)
      - [What it does](#what-it-does-1)
    - [`rn-firebase update`](#rn-firebase-update)
      - [Flags](#flags-2)
      - [What it does](#what-it-does-2)
  - [Configuration](#configuration)
    - [`rn-firebase.config.*`](#rn-firebaseconfig)
      - [Environment (`FirebaseEnv`)](#environment-firebaseenv)
      - [Root config (`RNFConfig`)](#root-config-rnfconfig)
    - [`config/firebase.config.*`](#configfirebaseconfig)
    - [`.env.{envName}`](#envenvname)
      - [Accessing env vars in your app](#accessing-env-vars-in-your-app)
  - [Multi-Environment Setup](#multi-environment-setup)
    - [Overview](#overview)
    - [Prefixed file naming](#prefixed-file-naming)
    - [APP\_ENV pattern and app.config.ts](#app_env-pattern-and-appconfigts)
    - [Loading .env files in Expo](#loading-env-files-in-expo)
  - [Usage Examples](#usage-examples)
    - [Interactive setup (full wizard)](#interactive-setup-full-wizard)
    - [Non-interactive setup with all flags](#non-interactive-setup-with-all-flags)
    - [Android-only configuration](#android-only-configuration)
    - [Skip `.gitignore` update](#skip-gitignore-update)
    - [Check configuration status](#check-configuration-status)
    - [Update config files (re-download)](#update-config-files-re-download)
    - [Update a specific environment](#update-a-specific-environment)
  - [Project Structure](#project-structure)
    - [Package structure](#package-structure)
  - [API](#api)
  - [Development](#development)
    - [Setup](#setup)
    - [Scripts](#scripts)
    - [Running in development mode](#running-in-development-mode)
    - [Testing](#testing)
    - [Building](#building)
  - [Limitations](#limitations)
  - [License](#license)
  - [About](#about)

---

## What is this?

Setting up Firebase in a React Native project is repetitive and error-prone. You need to:

1. Create Firebase apps in the Firebase Console
2. Download `google-services.json` and `GoogleService-Info.plist`
3. Configure `app.json` (Expo) or native build files (Bare RN)
4. Create environment-specific config files
5. Update `.gitignore` so you don't commit secrets

Do this across multiple environments (dev, staging, prod) and it becomes a chore.

**`@cardor/rn-firebase-cli` automates all of it.** One command downloads your config files, extracts the right values, wires them into your project, and generates reusable config for your app code.

---

## Features

- **Interactive wizard** — Guided prompts for project selection, platforms, environments
- **Non-interactive mode** — All options available as CLI flags for CI/CD pipelines
- **Auto-detection** — Detects Expo vs Bare RN, reads bundle IDs from `app.json`
- **Firebase API integration** — Lists projects, verifies apps, downloads config via `firebase-tools`
- **Multi-environment** — Supports dev, staging, prod (or custom names) in a single config
- **Web client ID extraction** — Automatically extracts the OAuth web client ID from `google-services.json`
- **Env file generation** — Writes all Firebase vars to `.env.{envName}` with the correct prefix per project type
- **Expo fully supported** — Writes `googleServicesFile` paths into `app.json`, generates `config/firebase.config.*`
- **`.gitignore` management** — Adds the output directory and `.env.*` pattern to `.gitignore` automatically
- **Status check** — See at a glance which Firebase files are configured
- **Update command** — Re-download config files after adding apps or changing projects

---

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| **Node.js** | `>=22.5.0` | ESM support required |
| **firebase-tools** | `>=13` | Must be installed globally (`npm install -g firebase-tools`) |
| **Project type** | — | ESM project (`"type": "module"` in `package.json`) |

You must also be able to run `firebase login` interactively at least once so the CLI can authenticate with Firebase.

---

## Installation

### Global install (recommended for CLI usage)

```bash
npm install -g @cardor/rn-firebase-cli
```

```bash
pnpm add -g @cardor/rn-firebase-cli
```

```bash
yarn global add @cardor/rn-firebase-cli
```

After installation, the `rn-firebase` binary is available globally:

```bash
rn-firebase --version
# 0.1.0
```

### Local install (for programmatic types)

```bash
npm install --save-dev @cardor/rn-firebase-cli
```

This gives you TypeScript types for the config schema (see [API](#api)). Run the CLI via `npx`:

```bash
npx rn-firebase init
```

---

## Quick Start

```bash
# 1. Install globally
npm install -g @cardor/rn-firebase-cli

# 2. Navigate to your React Native project
cd my-react-native-app

# 3. Run the interactive setup
rn-firebase init

# 4. Check what got configured
rn-firebase status
```

The wizard will guide you through:
- Selecting a Firebase project
- Choosing platforms (Android, iOS, or both)
- Picking an environment name (dev, staging, prod, or custom)
- Downloading config files
- Wiring everything into your project

---

## CLI Commands Reference

### `rn-firebase init`

**Interactive wizard** to configure Firebase in your React Native project.

```
rn-firebase init [options]
```

#### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--project <id>` | `string` | (interactive prompt) | Firebase project ID. Skips the interactive project selection. |
| `--platform <platform>` | `"android" \| "ios" \| "both"` | (interactive prompt) | Platform(s) to configure. Skips the platform selection prompt. |
| `--out <dir>` | `string` | `"keys"` | Output directory for `google-services.json` and `GoogleService-Info.plist`. |
| `--no-gitignore` | `boolean` | `true` (gitignore enabled) | Skip adding the output directory to `.gitignore`. |

#### What it does

1. Checks that `firebase-tools` is installed globally
2. Ensures you are authenticated with Firebase (triggers `firebase login` if needed)
3. Detects project type (Expo or Bare RN)
4. Reads bundle IDs from `app.json` (or prompts for them)
5. Lists Firebase projects and prompts you to select one
6. Verifies matching Firebase apps exist (by package name / bundle ID)
7. Downloads `google-services.json` (Android) and/or `GoogleService-Info.plist` (iOS)
8. Extracts the OAuth web client ID from `google-services.json`
9. Writes all config files
10. Generates a `.env.{envName}` file with all Firebase environment variables
11. Updates `app.json` with `googleServicesFile` paths (Expo)
12. Updates `.gitignore` to exclude the output directory and `.env.*` files
13. Prints a usage hint showing how to consume the env vars in your app

#### Files created

| File | Condition |
|------|-----------|
| `{outDir}/google-services.json` | Android or both platforms |
| `{outDir}/GoogleService-Info.plist` | iOS or both platforms |
| `config/firebase.config.{ts\|mjs\|cjs}` | Always (runtime config for your app) |
| `rn-firebase.config.{ts\|mjs\|cjs}` | Always (CLI config, reusable for updates) |
| `.env.{envName}` | Always (Firebase env vars for the selected environment) |

---

### `rn-firebase status`

**Check** which Firebase config files are present and configured.

```
rn-firebase status
```

#### Flags

None.

#### What it does

1. Loads `rn-firebase.config.*` from the current directory
2. Checks for the existence of:
   - `{outDir}/google-services.json`
   - `{outDir}/GoogleService-Info.plist`
   - `config/` directory (for `config/firebase.config.*`)
   - `rn-firebase.config` file
3. Prints green checkmarks (`✔`) or red crosses (`✗`) for each file
4. Displays current configuration: environments, platform, output directory

---

### `rn-firebase update`

**Re-download** Firebase config files. Useful after adding new apps to a project, changing project settings, or switching environments.

```
rn-firebase update [options]
```

#### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--env <name>` | `string` | First environment in config | Target environment name (e.g. `dev`, `staging`, `prod`). |

#### What it does

1. Loads `rn-firebase.config.*` from the current directory
2. Finds the target environment (by `--env` or first entry)
3. Checks `firebase-tools` and ensures authentication
4. Re-downloads `google-services.json` and/or `GoogleService-Info.plist`
5. Re-extracts the web client ID
6. Re-writes all config files (same locations as `init`)

**Note:** You must have run `rn-firebase init` at least once before using `update` — it reads the existing `rn-firebase.config.*` to know what to download.

---

## Configuration

The CLI generates two config files during `init`. Both are auto-generated — do not edit them directly. Re-run `rn-firebase init` or `rn-firebase update` to make changes.

### `rn-firebase.config.*`

This is the **CLI configuration file**. It tells `rn-firebase` what to download and where to put it. The CLI uses it for the `status` and `update` commands.

The file extension depends on your project:
- `.ts` — if `tsconfig.json` exists
- `.mjs` — if `package.json` has `"type": "module"` (default)
- `.cjs` — otherwise

```typescript
// rn-firebase.config.ts
import type { RNFConfig } from '@cardor/rn-firebase-cli'

export default {
  platform: 'both',
  outDir: 'keys',
  envs: [
    {
      name: 'dev',
      googleCloudProjectId: 'my-project-dev',
      firebaseProjectId: 'my-project-dev',
      android: { packageName: 'com.myapp.dev' },
      ios: { bundleId: 'com.myapp.dev' },
    },
  ],
} satisfies RNFConfig
```

#### Environment (`FirebaseEnv`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Environment name (e.g. `dev`, `staging`, `prod`) |
| `googleCloudProjectId` | `string` | Yes | GCP project ID |
| `firebaseProjectId` | `string` | No | Firebase project ID (defaults to `googleCloudProjectId`) |
| `android.packageName` | `string` | No | Android package name |
| `ios.bundleId` | `string` | No | iOS bundle identifier |

#### Root config (`RNFConfig`)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `platform` | `"android" \| "ios" \| "both"` | Yes | — | Configured platforms |
| `outDir` | `string` | No | `"keys"` | Output directory for downloaded config files |
| `envs` | `FirebaseEnv[]` | Yes | — | Environment configurations |

### `config/firebase.config.*`

This is a **runtime config file** for your application code. It contains static values (package names, bundle IDs) and references the Firebase web client ID via an environment variable rather than hardcoding it:

```typescript
// config/firebase.config.ts
export const FIREBASE_CONFIG = {
  webClientId: process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID,
  androidPackageName: 'com.myapp.dev',
  iosBundleId: 'com.myapp.dev',
}
```

Use it in your app like this:

```typescript
import { FIREBASE_CONFIG } from '../config/firebase.config'
```

### `.env.{envName}`

During `init`, the CLI generates a `.env.{envName}` file (e.g. `.env.dev`, `.env.staging`, `.env.prod`) in your project root. It contains all Firebase environment variables extracted from `google-services.json`.

The variable names include a prefix that matches your project type:

**Expo** (`EXPO_PUBLIC_` prefix — required for Expo's client-side env var system):

```
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSy...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=my-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=my-project-dev
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=my-project-dev.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:android:abcdef
EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
```

**Bare React Native** (no prefix — `react-native-config` convention):

```
FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=my-project.firebaseapp.com
FIREBASE_PROJECT_ID=my-project-dev
FIREBASE_STORAGE_BUCKET=my-project-dev.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:android:abcdef
FIREBASE_WEB_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
```

If the env file already exists with different content, the CLI will prompt before overwriting. The `.env.*` pattern is automatically added to `.gitignore` so these files are not committed.

#### Accessing env vars in your app

**Expo:** Variables are available as `process.env.EXPO_PUBLIC_FIREBASE_*` anywhere in your app code.

```typescript
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY
const webClientId = process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID
```

**Bare React Native:** Install `react-native-config` and access vars via `Config.*`:

```bash
npm install react-native-config
```

```typescript
import Config from 'react-native-config'

const apiKey = Config.FIREBASE_API_KEY
const webClientId = Config.FIREBASE_WEB_CLIENT_ID
```

---

## Multi-Environment Setup

### Overview

Every time you run `rn-firebase init`, the CLI sets up one environment (e.g. `dev`, `staging`, or `prod`). When you run it a second time for a different environment, it writes a second set of Firebase config files alongside the first — using a prefixed naming scheme to keep them separate.

### Prefixed file naming

Firebase native config files are written with the pattern `{env}-{id}-{base}`:

| Platform | Pattern | Example |
|----------|---------|---------|
| Android | `{env}-{packageName}-google-services.json` | `dev-com.myapp-google-services.json` |
| iOS | `{env}-{bundleId}-GoogleService-Info.plist` | `prod-com.myapp-GoogleService-Info.plist` |

This means your `keys/` directory will look like:

```
keys/
├── dev-com.myapp-google-services.json
├── dev-com.myapp-GoogleService-Info.plist
├── prod-com.myapp-google-services.json
└── prod-com.myapp-GoogleService-Info.plist
```

### APP_ENV pattern and app.config.ts

Expo reads whichever path is currently set in `app.json` (or `app.config.*`) — switching an environment variable alone is not enough. To switch between environments at build time, use `app.config.ts` with dynamic paths driven by an `APP_ENV` environment variable.

When you run `rn-firebase init` for a second environment and the CLI detects that `app.json` already has a `googleServicesFile` set (from the first run), it will offer to auto-generate an `app.config.ts`:

```
Multiple envs detected. Generate app.config.ts for dynamic Firebase paths (APP_ENV)?
```

If you accept, the CLI writes an `app.config.ts` that maps each environment to its correct Firebase config file:

```typescript
// Auto-generated by @cardor/rn-firebase-cli
// Commit this file. Do NOT commit your .env.* files.
import type { ExpoConfig } from 'expo/config'
import appJsonData from './app.json'

const env = (process.env.APP_ENV ?? 'dev') as string

const firebaseFiles: Record<string, { android?: string; ios?: string }> = {
  dev: {
    android: './keys/dev-com.myapp-google-services.json',
    ios: './keys/dev-com.myapp-GoogleService-Info.plist',
  },
  prod: {
    android: './keys/prod-com.myapp-google-services.json',
    ios: './keys/prod-com.myapp-GoogleService-Info.plist',
  },
}

const config = {
  ...appJsonData.expo,
  android: {
    ...(appJsonData.expo?.android as object | undefined),
    googleServicesFile: firebaseFiles[env]?.android,
  },
  ios: {
    ...(appJsonData.expo?.ios as object | undefined),
    googleServicesFile: firebaseFiles[env]?.ios,
  },
} as ExpoConfig

export default config
```

Then set `APP_ENV` before running your build:

```bash
APP_ENV=prod npx expo build
APP_ENV=dev npx expo start
```

If `app.config.ts` already exists (you created it manually), the CLI will print the snippet to add to your `firebaseFiles` map instead of overwriting.

### Loading .env files in Expo

**Expo SDK 49 and later** load `.env` files automatically — no extra setup needed. Set `APP_ENV` via your build tool or shell.

**Expo SDK 48 and earlier** require `dotenv/config` to be loaded manually. Add this to the top of your `app.config.ts`:

```typescript
import 'dotenv/config'
```

---

## Usage Examples

### Interactive setup (full wizard)

```bash
cd my-react-native-app
rn-firebase init
```

### Non-interactive setup with all flags

```bash
rn-firebase init \
  --project my-firebase-project \
  --platform both \
  --out firebase-keys
```

### Android-only configuration

```bash
rn-firebase init --platform android
```

### Skip `.gitignore` update

```bash
rn-firebase init --no-gitignore
```

### Check configuration status

```bash
rn-firebase status
```

Example output:

```
  Firebase setup status

  ✔ google-services.json
  ✔ GoogleService-Info.plist
  ✔ config/firebase.config.*
  ✔ rn-firebase.config

  Environments configured: dev, staging
  Platform: both
  Output dir: keys
```

### Update config files (re-download)

```bash
rn-firebase update
```

### Update a specific environment

```bash
rn-firebase update --env staging
```

---

## Project Structure

```
my-react-native-app/
├── rn-firebase.config.ts         # CLI config (auto-generated)
├── .env.dev                      # Firebase env vars — dev (gitignored)
├── config/
│   └── firebase.config.ts        # Runtime config (auto-generated)
├── keys/                         # Output directory (gitignored)
│   ├── google-services.json      # Android Firebase config (auto-generated)
│   └── GoogleService-Info.plist  # iOS Firebase config (auto-generated)
└── ...rest of your project
```

### Package structure

```
@cardor/rn-firebase-cli/
├── bin/
│   └── rfc.js                    # CLI entry point (#!/usr/bin/env node)
├── src/
│   ├── cli.ts                    # Commander setup, 3 commands
│   ├── index.ts                  # Public API (type exports only)
│   ├── types.ts                  # All type definitions
│   ├── commands/
│   │   ├── init.ts               # runInit() — full setup wizard (285 lines)
│   │   ├── status.ts             # runStatus() — check config presence (42 lines)
│   │   └── update.ts             # runUpdate() — re-download configs (83 lines)
│   ├── core/
│   │   ├── config/
│   │   │   ├── load.ts           # Config loader
│   │   │   ├── defaults.ts       # Default values
│   │   │   └── templates.ts      # File content generators
│   │   ├── materializer/
│   │   │   ├── index.ts          # RNMaterializer interface + factory
│   │   │   ├── expo.ts           # ExpoMaterializer (fully implemented)
│   │   │   └── bare-rn.ts        # BareRNMaterializer (placeholder)
│   │   ├── firebase/
│   │   │   ├── auth.ts           # firebase-tools check & login
│   │   │   ├── projects.ts       # List Firebase projects
│   │   │   ├── apps.ts           # List Android/iOS apps
│   │   │   ├── config-download.ts# Download google-services & GoogleService-Info
│   │   │   └── web-client.ts     # Extract web OAuth client ID
│   │   └── detector/
│   │       ├── index.ts          # Project type detection
│   │       ├── config-ext.ts     # Config extension detection (ts/mjs/cjs)
│   │       └── bundle-ids.ts     # Bundle ID detection from app.json / native files
│   ├── utils/
│   │   └── envFile.ts            # Env file generation utilities
│   └── tests/
│       ├── config.test.ts        # Tests for defaults, templates, web client
│       ├── detector.test.ts      # Tests for project type & config extension
│       ├── materializer.test.ts  # Tests for materializers
│       └── envFile.test.ts       # Tests for env file utilities
├── dist/                         # Build output (compiled)
├── tsup.config.ts                # Build config (ESM, ES2022)
├── tsconfig.json
└── package.json
```

---

## API

The package exports **TypeScript types only** (no runtime code). Import them to type-check your configuration files.

```typescript
import type {
  ConfigExt,         // 'ts' | 'mjs' | 'cjs'
  FirebaseApp,       // { appId, displayName?, packageName?, bundleId? }
  FirebaseEnv,       // { name, googleCloudProjectId, firebaseProjectId?, android?, ios? }
  FirebaseProject,   // { projectId, displayName }
  MaterializeParams, // Parameters for the materializer build method
  Platform,          // 'android' | 'ios' | 'both'
  ProjectType,       // 'expo' | 'bare'
  RNFConfig,         // { platform, outDir, envs }
} from '@cardor/rn-firebase-cli'
```

Use them in your `rn-firebase.config.ts`:

```typescript
import type { RNFConfig } from '@cardor/rn-firebase-cli'

export default {
  platform: 'both',
  outDir: 'keys',
  envs: [
    {
      name: 'prod',
      googleCloudProjectId: 'my-project-prod',
      android: { packageName: 'com.myapp' },
    },
  ],
} satisfies RNFConfig
```

---

## Development

### Setup

```bash
git clone https://github.com/enmanuelmag/rn-firebase-cli.git
cd rn-firebase-cli
pnpm install
```

### Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `pnpm dev` | `tsx src/cli.ts` | Run the CLI without building (uses `tsx` for TS execution) |
| `pnpm build` | `tsup && pnpm typecheck` | Build to `dist/` with TypeScript declarations |
| `pnpm test` | `node --test --import tsx/esm src/tests/*.test.ts` | Run test suite (30+ tests) |
| `pnpm typecheck` | `tsc --noEmit` | Type-check without emitting files |
| `pnpm lint` | `eslint . --fix` | Lint and auto-fix |
| `pnpm format` | `prettier --write src scripts` | Format source files |

### Running in development mode

```bash
pnpm dev init         # equivalent to: rn-firebase init
pnpm dev status       # equivalent to: rn-firebase status
pnpm dev update       # equivalent to: rn-firebase update
```

### Testing

```bash
pnpm test
```

The test suite uses Node's built-in test runner (`node:test`) with `tsx` for TypeScript transpilation. Tests cover:

- Config defaults and templates
- Web client ID extraction from `google-services.json`
- Project type detection
- Config extension detection

### Building

```bash
pnpm build
```

Uses `tsup` to bundle two entry points:
- `cli` (`src/cli.ts`) — the CLI binary
- `index` (`src/index.ts`) — the type-only public API

Output goes to `dist/` as ESM modules targeting ES2022.

---

## Limitations

| Area | Status |
|------|--------|
| **Expo (managed & bare)** | **Fully supported.** Auto-detects project type, reads `app.json`, writes `googleServicesFile` fields, generates config files. |
| **Bare React Native** | **Placeholder — coming in v2.** The CLI detects Bare RN projects and runs through the interactive wizard, but file creation is stubbed with informational messages. You can still select a Firebase project and download config files, but native build file integration is not yet implemented. |
| **Dynamic app.config** | Projects using `app.config.js` or `app.config.ts` (instead of `app.json`) are detected, but bundle IDs must be entered manually and `googleServicesFile` fields must be added by hand. |

---

## License

Apache 2.0 © [Enmanuel Magallanes](https://github.com/enmanuelmag)

---

## About

Created and maintained by [Enmanuel Magallanes](mailto:enmanuelmag@cardor.dev).

**@cardor/rn-firebase-cli** — Automated Firebase setup for React Native projects.
