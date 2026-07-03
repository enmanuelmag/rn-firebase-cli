# @cardor/rn-firebase-cli

Automated Firebase setup for React Native (Expo & Bare)

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
    - [`rn-firebase add`](#rn-firebase-add)
      - [What it does](#what-it-does-3)
    - [`rn-firebase sync`](#rn-firebase-sync)
      - [Flags](#flags-3)
      - [What it does](#what-it-does-4)
    - [`rn-firebase update-scripts`](#rn-firebase-update-scripts)
      - [What it does](#what-it-does-5)
    - [`rn-firebase build`](#rn-firebase-build)
      - [Flags](#flags-4)
      - [What it does](#what-it-does-6)
    - [`rn-firebase eas-update`](#rn-firebase-eas-update)
      - [Flags](#flags-5)
      - [What it does](#what-it-does-7)
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
    - [APP_ENV pattern and app.config.ts](#app_env-pattern-and-appconfigts)
    - [Loading .env files in Expo](#loading-env-files-in-expo)
  - [Auto-generated package.json scripts](#auto-generated-packagejson-scripts)
    - [Requirement](#requirement)
    - [Generated scripts](#generated-scripts)
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
- **Auto-generated npm scripts** — Injects `ios:{env}`, `android:{env}`, `start:{env}` scripts (and, for **Expo projects only**, `build:{env}:{platform}[:submit]` and `eas-update:{env}`) into your project's `package.json` using `dotenv-cli`; `ios` and `android` scripts automatically call `rn-firebase sync` to keep native config files in sync before each run
- **Local EAS build & OTA update commands (Expo only)** — `rn-firebase build` runs a local-only `eas build --local` (with optional local submit) for a given environment, and `rn-firebase eas-update` publishes OTA updates via `eas update` — both with a live header, rolling output tail, and full log file for troubleshooting. Both commands (and their generated scripts) currently only support Expo projects — see [`rn-firebase build`](#rn-firebase-build) for rationale

---

## Prerequisites

| Requirement        | Minimum    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js**        | `>=22.5.0` | ESM support required                                                                                                                                                                                                                                                                                                                                                                                                            |
| **firebase-tools** | `>=13`     | Must be installed globally (`npm install -g firebase-tools`)                                                                                                                                                                                                                                                                                                                                                                    |
| **Project type**   | —          | ESM project (`"type": "module"` in `package.json`)                                                                                                                                                                                                                                                                                                                                                                              |
| **gcloud CLI**     | any        | Optional but recommended. Used to check and enable Firebase services (Authentication, Firestore, Storage) during `init`, and to automatically provision the default Firestore database (with a selectable region, default `nam5`) when Firestore is selected. If not installed, service detection and database creation are skipped gracefully. Install from [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install). |

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

- Choosing to use an existing Firebase project or create a new one
- Selecting or creating a Firebase project
- Enabling Firebase services (Authentication, Firestore, Storage)
- Automatically creating the default Firestore database (region selectable, default `nam5`) if one doesn't already exist
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

| Flag                    | Type                           | Default                    | Description                                                                 |
| ----------------------- | ------------------------------ | -------------------------- | --------------------------------------------------------------------------- |
| `--project <id>`        | `string`                       | (interactive prompt)       | Firebase project ID. Skips the interactive project selection.               |
| `--platform <platform>` | `"android" \| "ios" \| "both"` | (interactive prompt)       | Platform(s) to configure. Skips the platform selection prompt.              |
| `--out <dir>`           | `string`                       | `"keys"`                   | Output directory for `google-services.json` and `GoogleService-Info.plist`. |
| `--no-gitignore`        | `boolean`                      | `true` (gitignore enabled) | Skip adding the output directory to `.gitignore`.                           |

#### What it does

1. Checks that `firebase-tools` is installed globally
2. Ensures you are authenticated with Firebase (triggers `firebase login` if needed)
3. Detects project type (Expo or Bare RN)
4. Reads bundle IDs from `app.json` (or prompts for them)
5. Prompts whether to **use an existing Firebase project** or **create a new one**
   - If creating: prompts for a display name and project ID, then calls `firebase projects:create`
   - If using existing: lists your projects and prompts you to select one
6. Shows a **multi-select** for Firebase services to enable (Authentication, Cloud Firestore, Cloud Storage)
   - Services already enabled on the project are shown as dimmed/pre-checked and cannot be toggled
   - Newly selected services are enabled via `gcloud services enable`
   - If Firestore is selected (or already enabled) and no default database exists yet, prompts for a database location (default: `nam5`) and creates it via `gcloud firestore databases create`
   - If Authentication is selected or already enabled, prints a prominent boxed reminder with a direct link to `https://console.firebase.google.com/project/<projectId>/authentication/providers` to activate a sign-in provider, plus a note that you must re-download your native config files (`GoogleService-Info.plist` / `google-services.json`) afterward — the `REVERSED_CLIENT_ID` needed for sign-in may only be added once a provider is enabled. Run `rn-firebase update` to re-download the latest config files
7. Verifies matching Firebase apps exist (by package name / bundle ID)
8. Downloads `google-services.json` (Android) and/or `GoogleService-Info.plist` (iOS)
9. Extracts the OAuth web client ID from `google-services.json`
10. Writes all config files
11. Generates a `.env.{envName}` file with all Firebase environment variables
12. Updates `app.json` with `googleServicesFile` paths (Expo)
13. Updates `.gitignore` to exclude the output directory and `.env.*` files
14. Prints a usage hint showing how to consume the env vars in your app

> **Note:** Steps 5 and 6 (project selection and service enablement) are skipped when `--project <id>` is passed — the CLI goes directly to app verification in non-interactive mode.

#### Files created

| File                                   | Condition                                               |
| -------------------------------------- | ------------------------------------------------------- |
| `{outDir}/google-services.json`        | Android or both platforms                               |
| `{outDir}/GoogleService-Info.plist`    | iOS or both platforms                                   |
| `config/firebase.config.{ts\|mjs\|js}` | Always (runtime config for your app)                    |
| `rn-firebase.config.{ts\|mjs\|js}`     | Always (CLI config, reusable for updates)               |
| `.env.{envName}`                       | Always (Firebase env vars for the selected environment) |

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

| Flag           | Type     | Default                     | Description                                              |
| -------------- | -------- | --------------------------- | -------------------------------------------------------- |
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

### `rn-firebase add`

**Add a new Firebase environment** to an already-initialized project. Use this when you have already run `rn-firebase init` and want to add a second (or third) environment — for example, adding a `staging` or `prod` Firebase project after setting up `dev`.

```
rn-firebase add
```

No flags — the command is fully interactive.

#### What it does

1. Loads `rn-firebase.config.*` from the current directory — exits with an error if not found
2. Reads `platform`, `outDir`, and bundle IDs (`packageName` / `bundleId`) from the existing config — does **not** re-prompt for these
3. Checks `firebase-tools` is installed and ensures you are authenticated
4. Prompts: select or create a Firebase project for the new environment
5. Prompts: choose an environment name (`dev`, `staging`, `prod`, or custom)
6. Looks up existing Firebase apps by bundle ID — offers to create them if missing
7. Downloads `google-services.json` and/or `GoogleService-Info.plist` for the new environment
8. Merges the new environment into `rn-firebase.config.*` — replaces an existing entry with the same name, otherwise appends
9. If `app.config.ts` already exists (Expo projects), regenerates it with all environments
10. Injects `package.json` scripts for the new environment name

**Example — adding a production environment after `init` created `dev`:**

```bash
# Already ran: rn-firebase init  (created dev env)
rn-firebase add
# Prompts: Firebase project → prod-project-id
# Prompts: env name → prod
# Result: rn-firebase.config.* now has both dev + prod envs
```

**Note:** You must have run `rn-firebase init` at least once before using `add`. The bundle IDs (`packageName` and `bundleId`) are taken from the first environment in the existing config — all environments share the same app identity.

---

### `rn-firebase sync`

Copies the downloaded Firebase config files from the output directory (`outDir`) into the correct native folders expected by the build system.

```bash
rn-firebase sync
rn-firebase sync --env staging
rn-firebase sync --env staging --clean-if-changed
```

#### Flags

| Flag                 | Description                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--env <name>`       | Environment to sync (default: first env in config)                                                                                                                                                                                               |
| `--clean-if-changed` | Delete the native `ios/` or `android/` folder instead of copying in place, whenever the active env's Firebase config file changed since the last run (see below). Included by default in the scripts generated by `init`/`add`/`update-scripts`. |

#### What it does

1. Loads `rn-firebase.config.*` — exits with an error if not found
2. Resolves the target environment (by name or defaults to the first)
3. **Android** (if `platform` is `android` or `both`):
   - Source: `{outDir}/{env}-{packageName}-google-services.json`
   - Destination: `android/app/google-services.json`
   - If `--clean-if-changed` is set, see "Hash-based native folder cleaning" below — this replaces steps 4-6 whenever the hash changed
   - If `android/app/` does not exist (prebuild not yet run) → prints a warning and skips, does **not** exit
   - SHA-256 comparison: if source and destination are identical → reports "already up to date", no write
   - Otherwise: copies the file
4. **iOS** (if `platform` is `ios` or `both`):
   - Source: `{outDir}/{env}-{bundleId}-GoogleService-Info.plist`
   - Destination: resolved by reading `app.json → expo.name → ios/{name}/` first, then falling back to scanning `ios/` for the first subdirectory that already contains `GoogleService-Info.plist`
   - If `--clean-if-changed` is set, the hash check happens before this destination resolution — see below
   - If no native iOS folder is found → prints a warning and skips
   - SHA-256 comparison: if already in sync → reports "already up to date"
   - Otherwise: copies the file
5. No network calls, no firebase-tools, no authentication required

#### Hash-based native folder cleaning (`--clean-if-changed`)

Expo only copies `googleServicesFile` into the native `ios/`/`android/` projects during `expo prebuild` — it is **not** re-copied on every `expo run:*`. So if you switch `APP_ENV` (dev/staging/prod) after the native folders already exist, the stale config silently stays in place unless you remember to run a clean prebuild yourself.

`--clean-if-changed` automates that: for each active platform, it hashes (SHA-256) the resolved **source** config file for the active env (never the destination — the destination may not exist yet) and compares it against the hash stored the last time `sync` ran, in a local, gitignored state file at `.rn-firebase/env-state.json` (shape: `{ "android"?: string, "ios"?: string }`, one hash per platform).

- If the hash differs from what's stored (or nothing is stored yet, e.g. first run) → the corresponding native folder (`ios/` or `android/`) is deleted entirely and the new hash is persisted. The in-place file copy is skipped for that platform since the folder no longer exists — run `expo prebuild` afterwards to regenerate it with the correct config baked in.
- If the hash matches → nothing is deleted; `sync` falls back to its normal in-place copy/"already up to date" behavior for that platform, untouched.

Android and iOS are tracked and cleaned independently — changing only the iOS config will never touch `android/`, and vice versa. Comparing file **content** (not just env name) also means dev/local sharing the same underlying config file won't trigger unnecessary cleanup.

The `.rn-firebase/` directory is added to `.gitignore` automatically (best-effort) by `init` and by `sync` itself the first time it writes the state file.

> **Tip:** The `ios:{env}` and `android:{env}` scripts injected by `init`/`update-scripts` automatically call `rn-firebase sync --clean-if-changed` before launching the app.

---

### `rn-firebase update-scripts`

Updates the `ios:{env}`, `android:{env}` scripts (and, for **Expo projects only**, `build:{env}:{platform}[:submit]` and `eas-update:{env}`) in your `package.json`.

```bash
rn-firebase update-scripts
```

No flags.

#### What it does

1. Loads `rn-firebase.config.*` — exits with an error if not found
2. Detects the project type (`rn-firebase detectProjectType`) — Expo, bare React Native, or undetected
3. Reads `package.json` from the current directory
4. For each environment in `config.envs`, builds the expected script values (only for the platforms enabled in `config.platform`):
   - `ios:{env}` → `rn-firebase sync --env {env} --clean-if-changed && APP_ENV={env} dotenv -e .env.{env} -- expo run:ios`
   - `android:{env}` → `rn-firebase sync --env {env} --clean-if-changed && APP_ENV={env} dotenv -e .env.{env} -- expo run:android`
   - `--clean-if-changed` is included by default — see [Hash-based native folder cleaning](#rn-firebase-sync) for what it does
   - **Expo projects only:**
     - `build:{env}:ios` → `rn-firebase build --platform ios --env {env} --profile production`
     - `build:{env}:ios:submit` → `rn-firebase build --platform ios --env {env} --profile production --submit`
     - `build:{env}:android` → `rn-firebase build --platform android --env {env} --profile production`
     - `build:{env}:android:submit` → `rn-firebase build --platform android --env {env} --profile production --submit`
     - `eas-update:{env}` → `rn-firebase eas-update --profile {env}`
5. If a script already exists **and** starts with the corresponding `rn-firebase sync`/`rn-firebase build`/`rn-firebase eas-update` prefix → skips it (already up to date)
6. Otherwise → overwrites with the new value (adds the prefix to old/custom scripts, or creates new ones)
7. Writes `package.json` back and prints a summary. For bare React Native (or undetected) projects, also prints an informational line explaining that `build:`/`eas-update:` scripts were skipped because they are an Expo-only feature.

> **Expo-only scripts:** the `build:{env}:{platform}[:submit]` and `eas-update:{env}` scripts are only generated for Expo projects (detected via `app.json`'s `expo` key or `app.config.js/ts`). Bare React Native projects (and projects where the type can't be detected) still get `ios:{env}`/`android:{env}` scripts — see [`rn-firebase build`](#rn-firebase-build) for why build/eas-update support is Expo-only for now.

> **Migration note:** If you already ran `rn-firebase init` on an Expo project, run `rn-firebase update-scripts` once to update your existing scripts to include the automatic sync step, and to add the new `build:{env}:{platform}` and `eas-update:{env}` scripts.

> **`eas-update` message flag:** The generated `eas-update:{env}` script deliberately omits `-m/--message`, since the update message varies for every publish. Pass it through with npm/pnpm's argument-forwarding syntax:
>
> ```bash
> npm run eas-update:dev -- -m "your message"
> # or
> pnpm eas-update:dev -m "your message"
> ```

---

### `rn-firebase build`

Runs a **local-only** EAS build (`eas build --local`) for a given environment, with an optional local submit step. This command never runs a remote/cloud EAS build — for remote builds, use the `eas` CLI directly.

> **Expo only:** `rn-firebase build` currently only supports Expo projects (EAS tooling is Expo's build/submit toolchain — there is no equivalent bare React Native path yet). Running it in a bare React Native project (or a project whose type can't be detected) prints an error and exits before any config loading or `eas` invocation. Bare RN build support is planned for a future release.

```bash
rn-firebase build
rn-firebase build --platform android --env staging
rn-firebase build --platform ios --profile preview --submit
rn-firebase build --platform all --binary-version latest --submit
```

#### Flags

| Flag                                 | Description                                                                                                                  | Default             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `-p, --platform <platform>`          | Platform to build for: `android`, `ios`, or `all`                                                                            | `all`               |
| `--env <name>`                       | Environment name, validated against `rn-firebase.config`'s `envs[]`                                                          | first env in config |
| `--profile <profile>`                | EAS build profile (free-form — not restricted to a fixed list; passed through to `eas` as-is)                                | `production`        |
| `-o, --output <dir>`                 | Output folder for local build artifacts                                                                                      | `build`             |
| `--submit`                           | Also run `eas submit --local` after a successful build                                                                       | off                 |
| `--binary-version <version\|latest>` | Reuse an existing binary (`latest`, or a specific build id) instead of running a local build — skips the build step entirely | none                |
| `-s, --skip-build-validation`        | Skip the built-version duplicate check                                                                                       | off                 |

#### What it does

1. Detects the project type; if it's bare React Native (or undetected), prints an Expo-only error and exits **before** loading `rn-firebase.config.*` or doing anything else.
2. Loads `rn-firebase.config.*` and validates `--env` against `config.envs[].name` (same validation as `rn-firebase sync`/`update`) — exits with an error if the config or environment is not found.
3. If a consumer `eas.json` exists and `--profile` isn't one of its `build` profile keys, prints a non-blocking warning and continues (the profile is never validated as a hard-coded enum).
4. Performs an **advisory, non-blocking** duplicate-build check: resolves the app version from `app.json`'s `expo.version`, falling back to `package.json`'s `version`, and warns (without stopping) if that version + platform combination was already built before, based on a local dedup file at `.rn-firebase/built-versions.json` (gitignored, no git operations of any kind). Skip this check entirely with `--skip-build-validation`.
5. Loads `.env.<envName>` (via `dotenv`) and sets `process.env.APP_ENV` to the environment name before invoking `eas`.
6. Runs `eas build --local --platform <platform> --profile <profile> --output <dir> --non-interactive`, showing a persistent header (platform, profile, env + which `.env.<name>` file was loaded, "local build" indicator) above a rolling tail of the build output.
7. Mirrors the full combined build output to a log file under your OS temp directory (`rn-firebase-build-<timestamp>.log`) and prints its path when the command finishes (success or failure).
8. On failure, prints the exact failed command plus the last 10 lines of output, and exits non-zero.
9. On success, records the built version for the duplicate check (step 4) and, if `--submit` was passed, runs `eas submit --local` (or, when `--binary-version` is set, `eas submit --latest`/`--id <version>` against the existing binary) with the same header/tail/log-file behavior.

> **Local-only by design:** `rn-firebase build` intentionally has no `--local`/`--remote` toggle — it only ever runs local EAS builds. If you need a remote/cloud EAS build, run the `eas` CLI directly (e.g. `eas build --platform android --profile production`).

---

### `rn-firebase eas-update`

Publishes an OTA update via `eas update`. This is a distinct command from `rn-firebase update` (which re-downloads Firebase config files) — `eas-update` only talks to EAS Update.

> **Expo only:** like `rn-firebase build`, `rn-firebase eas-update` currently only supports Expo projects (EAS Update is Expo's OTA update service — there is no bare React Native equivalent). Running it in a bare React Native project (or a project whose type can't be detected) prints an error and exits immediately.

```bash
rn-firebase eas-update --profile production --message "fix: crash on launch"
rn-firebase eas-update --profile preview -m "test update"
```

#### Flags

| Flag                   | Description                                                                | Default      |
| ---------------------- | -------------------------------------------------------------------------- | ------------ |
| `--profile <profile>`  | EAS update profile (free-form — also used as the update branch name)       | `production` |
| `-m, --message <text>` | Update message (**required** — the command exits with an error if omitted) | —            |

#### What it does

1. Detects the project type; if it's bare React Native (or undetected), prints an Expo-only error and exits immediately.
2. Requires `-m/--message`; exits with a clear error if it's missing.
3. If a consumer `eas.json` exists and `--profile` isn't one of its `build` profile keys, prints a non-blocking warning and continues.
4. Maps the update branch to the `--profile` value (there is no separate `--branch` flag in this command — the profile name is used as the branch).
5. Runs `eas update --branch <profile> --message "<text>" --non-interactive`, with the same persistent header, rolling tail, tmpdir log file, and failure-tail behavior described for `rn-firebase build`.

> **Local-only by design:** like `rn-firebase build`, `rn-firebase eas-update` is a thin, opinionated wrapper — for anything beyond this (custom branch names, rollout percentages, etc.), use the `eas` CLI directly.

---

## Configuration

The CLI generates two config files during `init`. Both are auto-generated — do not edit them directly. Re-run `rn-firebase init` or `rn-firebase update` to make changes.

### `rn-firebase.config.*`

This is the **CLI configuration file**. It tells `rn-firebase` what to download and where to put it. The CLI uses it for the `status` and `update` commands.

The file extension depends on your project:

- `.ts` — if `tsconfig.json` exists
- `.mjs` — if `package.json` has `"type": "module"`
- `.js` — if `package.json` has `"type": "commonjs"` or no `type` field (default for Expo/RN projects)

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

| Field                  | Type     | Required | Description                                              |
| ---------------------- | -------- | -------- | -------------------------------------------------------- |
| `name`                 | `string` | Yes      | Environment name (e.g. `dev`, `staging`, `prod`)         |
| `googleCloudProjectId` | `string` | Yes      | GCP project ID                                           |
| `firebaseProjectId`    | `string` | No       | Firebase project ID (defaults to `googleCloudProjectId`) |
| `android.packageName`  | `string` | No       | Android package name                                     |
| `ios.bundleId`         | `string` | No       | iOS bundle identifier                                    |

#### Root config (`RNFConfig`)

| Field      | Type                           | Required | Default  | Description                                  |
| ---------- | ------------------------------ | -------- | -------- | -------------------------------------------- |
| `platform` | `"android" \| "ios" \| "both"` | Yes      | —        | Configured platforms                         |
| `outDir`   | `string`                       | No       | `"keys"` | Output directory for downloaded config files |
| `envs`     | `FirebaseEnv[]`                | Yes      | —        | Environment configurations                   |

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

| Platform | Pattern                                     | Example                                   |
| -------- | ------------------------------------------- | ----------------------------------------- |
| Android  | `{env}-{packageName}-google-services.json`  | `dev-com.myapp-google-services.json`      |
| iOS      | `{env}-{bundleId}-GoogleService-Info.plist` | `prod-com.myapp-GoogleService-Info.plist` |

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
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const env = (process.env.APP_ENV ?? 'dev') as string

const ENV_COLORS: Record<string, string> = {
  dev: '\x1b[36m',
  staging: '\x1b[33m',
  prod: '\x1b[31m',
}
const envColor = ENV_COLORS[env] ?? '\x1b[35m'
console.log(`${envColor}[rn-firebase-cli] Active environment: ${env}\x1b[0m`)

const firebaseFiles: Record<string, { android?: string; ios?: string }> = {
  dev: {
    android: resolve(__dirname, 'keys/dev-com.myapp-google-services.json'),
    ios: resolve(__dirname, 'keys/dev-com.myapp-GoogleService-Info.plist'),
  },
  prod: {
    android: resolve(__dirname, 'keys/prod-com.myapp-google-services.json'),
    ios: resolve(__dirname, 'keys/prod-com.myapp-GoogleService-Info.plist'),
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

**Colored environment indicator**: the generated `app.config.ts` prints a color-coded line to the console showing which `APP_ENV` is active whenever Expo evaluates it (e.g. on `expo start`, `expo prebuild`, or `eas build`):

```
[rn-firebase-cli] Active environment: dev
```

This uses plain ANSI escape codes (no extra dependency required in your project — `chalk` is only used internally by the CLI itself, never in generated output). Color mapping: `dev` is cyan, `staging` is yellow, `prod` is red, and any custom/unrecognized environment name falls back to magenta. This helps catch accidental builds against the wrong environment at a glance.

If `app.config.ts` already exists (you created it manually), the CLI will print the snippet to add to your `firebaseFiles` map instead of overwriting.

### Loading .env files in Expo

**Expo SDK 49 and later** load `.env` files automatically — no extra setup needed. Set `APP_ENV` via your build tool or shell.

**Expo SDK 48 and earlier** require `dotenv/config` to be loaded manually. Add this to the top of your `app.config.ts`:

```typescript
import 'dotenv/config'
```

---

## Auto-generated package.json scripts

After running `init` or `update`, the CLI automatically injects convenience scripts into your project's `package.json` based on your platform and environment name.

### Requirement

`dotenv-cli` must be installed in your project:

```bash
pnpm add -D dotenv-cli
```

If it is missing, the CLI prints a warning but still writes the scripts.

### Generated scripts

> **Expo-only scripts:** `build:{env}:{platform}[:submit]` and `eas-update:{env}` are only injected for Expo projects. Bare React Native projects (and projects whose type can't be detected) still get `ios:{env}`/`android:{env}`/`start:{env}`.

For `platform: 'ios'` and `envName: 'dev'` (Expo project):

```json
{
  "scripts": {
    "ios:dev": "rn-firebase sync --env dev --clean-if-changed && APP_ENV=dev dotenv -e .env.dev -- expo run:ios",
    "start:dev": "APP_ENV=dev dotenv -e .env.dev -- expo start",
    "build:dev:ios": "rn-firebase build --platform ios --env dev --profile production",
    "build:dev:ios:submit": "rn-firebase build --platform ios --env dev --profile production --submit",
    "eas-update:dev": "rn-firebase eas-update --profile dev"
  }
}
```

For `platform: 'android'` (Expo project):

```json
{
  "scripts": {
    "android:dev": "rn-firebase sync --env dev --clean-if-changed && APP_ENV=dev dotenv -e .env.dev -- expo run:android",
    "start:dev": "APP_ENV=dev dotenv -e .env.dev -- expo start",
    "build:dev:android": "rn-firebase build --platform android --env dev --profile production",
    "build:dev:android:submit": "rn-firebase build --platform android --env dev --profile production --submit",
    "eas-update:dev": "rn-firebase eas-update --profile dev"
  }
}
```

For `platform: 'both'`, all of the above are injected: `ios:dev`, `android:dev`, `start:dev`, `build:dev:ios`, `build:dev:ios:submit`, `build:dev:android`, `build:dev:android:submit`, and `eas-update:dev`.

The `--clean-if-changed` flag is included by default — it deletes the native `ios/`/`android/` folder instead of copying in place whenever the active env's Firebase config file changed since the last run, forcing a clean `expo prebuild`. See [Hash-based native folder cleaning](#rn-firebase-sync) for details.

The generated `eas-update:{env}` script deliberately omits `-m/--message` (the update message varies per publish). Forward it via `npm run eas-update:dev -- -m "your message"` (or `pnpm eas-update:dev -m "your message"`).

Scripts that already exist in `package.json` are **never overwritten**. To update existing scripts with the sync/build/eas-update prefix, run `rn-firebase update-scripts`.

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
│   │       ├── config-ext.ts     # Config extension detection (ts/mjs/js)
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
  ConfigExt, // 'ts' | 'mjs' | 'cjs' | 'js'
  FirebaseApp, // { appId, displayName?, packageName?, bundleId? }
  FirebaseEnv, // { name, googleCloudProjectId, firebaseProjectId?, android?, ios? }
  FirebaseProject, // { projectId, displayName }
  MaterializeParams, // Parameters for the materializer build method
  Platform, // 'android' | 'ios' | 'both'
  ProjectType, // 'expo' | 'bare'
  RNFConfig, // { platform, outDir, envs }
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

| Script           | Command                                            | Description                                                |
| ---------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`       | `tsx src/cli.ts`                                   | Run the CLI without building (uses `tsx` for TS execution) |
| `pnpm build`     | `tsup && pnpm typecheck`                           | Build to `dist/` with TypeScript declarations              |
| `pnpm test`      | `node --test --import tsx/esm src/tests/*.test.ts` | Run test suite (30+ tests)                                 |
| `pnpm typecheck` | `tsc --noEmit`                                     | Type-check without emitting files                          |
| `pnpm lint`      | `eslint . --fix`                                   | Lint and auto-fix                                          |
| `pnpm format`    | `prettier --write src scripts`                     | Format source files                                        |

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

| Area                      | Status                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Expo (managed & bare)** | **Fully supported.** Auto-detects project type, reads `app.json`, writes `googleServicesFile` fields, generates config files.                                                                                                                                                                    |
| **Bare React Native**     | **Placeholder — coming in v2.** The CLI detects Bare RN projects and runs through the interactive wizard, but file creation is stubbed with informational messages. You can still select a Firebase project and download config files, but native build file integration is not yet implemented. |
| **Dynamic app.config**    | Projects using `app.config.js` or `app.config.ts` (instead of `app.json`) are detected, but bundle IDs must be entered manually and `googleServicesFile` fields must be added by hand.                                                                                                           |
| **`build`/`eas-update` (Bare RN)** | **Expo-only for now.** `rn-firebase build` and `rn-firebase eas-update` rely on Expo's EAS build/update tooling, which has no bare React Native equivalent. Both commands exit with an error on bare RN (or undetected) projects, and the corresponding `build:{env}:{platform}[:submit]`/`eas-update:{env}` scripts are omitted by `rn-firebase init`/`update-scripts` for those projects. |

---

## License

Apache 2.0 © [Enmanuel Magallanes](https://github.com/enmanuelmag)

---

## About

Created and maintained by [Enmanuel Magallanes](mailto:enmanuelmag@cardor.dev).

**@cardor/rn-firebase-cli** — Automated Firebase setup for React Native projects.
