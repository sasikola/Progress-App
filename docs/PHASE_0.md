# Phase 0 — Foundation

Updated: 2026-09-23

## Implemented

- Existing React Native CLI 0.87.1 / React 19.2.3 foundation retained.
- Black theme with lime accent, shared typography/spacing/radius/motion tokens.
- Typed root stack and Home, Workout, Progress, You tabs with icons and labels.
- Shared screen, text, button, input, loading, empty, error, and entrance components.
- Native Animated feedback and dynamic Reduce Motion preference handling.
- TanStack Query provider with foreground focus handling.
- Supabase client with validated build-time environment configuration and a
  working preview when configuration is missing.
- Native dark launch styling, navigation module setup, and environment integration.
- Formatting/type-check scripts, focused tests, environment template, and setup docs.

## Files

The implementation is in `App.tsx` and `src/{components,hooks,lib,navigation,screens,theme}`.
Tooling changes include `package.json`, `package-lock.json`, `.gitignore`,
`.env.example`, `jest.config.js`, `jest.setup.js`, and `__tests__/`.
Setup instructions are in `README.md`.

Native changes: `ios/Podfile.lock`, `ios/Progress/Info.plist`,
`ios/Progress/LaunchScreen.storyboard`, `android/app/build.gradle`,
`android/app/src/main/AndroidManifest.xml`,
`android/app/src/main/java/com/progress/MainActivity.kt`, and
`android/app/src/main/res/values/styles.xml`.

The existing user edits in `PROGRESS_APP_SPEC.md` were preserved.

## Dependencies

| Added package | Installed version |
| --- | --- |
| @react-navigation/native | 7.4.1 |
| @react-navigation/native-stack | 7.19.2 |
| @react-navigation/bottom-tabs | 7.19.2 |
| react-native-screens | 4.28.0 |
| react-native-config | 1.7.2 |
| @supabase/supabase-js | 2.117.0 |
| @tanstack/react-query | 5.103.2 |
| react-native-url-polyfill | 4.0.0 |

The starter-only `@react-native/new-app-screen` dependency was removed. Existing
safe-area support is reused. Node's engine range now matches React Native's
installed package requirement. No animation, icon-font, or Expo packages were added.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| ESLint | Passed, no warnings |
| Prettier | Passed |
| Jest | 4 suites, 10 tests passed |
| iOS JavaScript bundle | Built through Metro |
| CocoaPods | Installed successfully through Bundler |
| iOS native build | Passed for iPhone 17 Pro simulator after build/simulator service recovery |
| iOS simulator launch | Not verified: simulator was shut down when CLI attempted installation/launch (CoreSimulator error 405) |
| Physical iPhone build | User's attempt stopped with signing error: no development team selected |
| Android debug build | Passed, all four configured architectures; 133 tasks executed |
| Android emulator launch | No virtual device configured; system-image folder is empty |
| Live Supabase connection | Not tested; no project configuration supplied |

Tests cover navigation from Home to Workout and between the remaining tabs,
missing/malformed environment values, real Supabase SDK initialization using
test-only public configuration without network calls, and busy button semantics.
Jest mocks native environment and safe-area modules, so these checks do not
replace a native launch test.

Gradle installed the required NDK 27.1.12297006, Build Tools 37.0.0, and CMake
3.22.1 using existing SDK license acceptance. The debug APK is at
`android/app/build/outputs/apk/debug/app-debug.apk`.

The iOS CLI reported successful compilation but subsequently failed to install
and launch because its simulator was shut down. Its zero exit status does not
establish a successful launch. No visual validation of the app is claimed.

Physical-device signing remains an account-specific setup step: choose a team
under the Progress target's Signing & Capabilities in Xcode. Detailed steps are
in README. No team identifier was guessed or signing disabled.

## Scope and next phase

No database migrations, tables, RLS policies, or storage buckets were changed.
There are no sign-in, onboarding, workout, chart, or photo workflows yet. Screens
show honest preview states with no fabricated user records.

Session persistence and auto-refresh are disabled until Phase 1 supplies secure
storage and lifecycle handling. The root currently opens the preview; Phase 1
will introduce auth routing. React Hook Form, Zod, and resolvers enter with real
forms. Haptics and draft storage remain deferred to the relevant feature phases.

Do not advance to Phase 1 until the remaining Phase 0 acceptance checks are
resolved or their deferral is explicitly accepted.
