# Progress

Train. Track. Progress.

An iOS-first React Native CLI app with a dark visual foundation, authentication,
onboarding, a data-backed Home dashboard, workout logging, and Progress tracking.
Workout setup requires the [Phase 4 migration](docs/PHASE_4.md); weight/measurement
charts and lifting records require the [Phase 5 migration](docs/PHASE_5.md).
Private photo uploads and before/after comparison require the [Phase 6 setup](docs/PHASE_6.md)
and a native rebuild for the photo picker.

[Phase 7 polish](docs/PHASE_7.md) adds keyboard/accessibility improvements,
clearer feedback states and bounded photo-page rendering. Its device acceptance
checklist is separate from Phase 8 release readiness.

Nutrition/calorie/macro tracking (search foods, log meals, daily targets)
requires the [Phase 9 setup](docs/PHASE_9.md): the SQL migration, a deployed
`search-foods` Supabase Edge Function, and a USDA FoodData Central API key
set as a function secret (never a client `.env` value). Recent/favorite
foods, custom foods, and Open Food Facts barcode lookup require the
[Phase 10 setup](docs/PHASE_10.md) on top of Phase 9: another SQL migration
and a deployed `get-food-by-barcode` function (no extra secret needed).
Scanning a barcode with the camera (rather than typing it) requires the
[Phase 11 setup](docs/PHASE_11.md): a native rebuild for the new
`react-native-camera-kit` dependency (`pod install` on iOS; a new Android
`CAMERA` permission).

## Local setup

Use the Node versions supported by `package.json` and npm. The lockfile pins the
dependency tree. This project uses React Native 0.87.1 and React 19.2.3.

```sh
npm ci
bundle install
cd ios
bundle exec pod install
cd ..
npm start
```

In another terminal:

```sh
npm run ios -- --simulator "iPhone 17 Pro"
```

Select an installed simulator name from `xcrun simctl list devices available`.
CocoaPods is managed by the Gemfile: use `bundle exec pod`, even if `pod` is not
on your shell PATH. Run pod installation after changing native dependencies.

### Run on a physical iPhone

Physical-device builds require your Apple development team and a provisioning
profile. Keep the development team and bundle identifier appropriate to your
Apple account; do not replace an existing working signing configuration.

1. Open `ios/Progress.xcworkspace` in Xcode.
2. In Xcode Settings > Apple Accounts, sign in with your Apple Account if needed.
3. Select the blue Progress project, then the **Progress target** under Targets.
4. Open Signing & Capabilities, enable Automatically manage signing, and select
   your team (a Personal Team can be used for local testing). Apply the selection
   to both Debug and Release configurations.
5. Use a unique Bundle Identifier if the template identifier cannot be registered.
6. Select the connected iPhone as the run destination and run once from Xcode so
   it can create the required development signing assets. Follow any device trust
   or Developer Mode prompts.

After Xcode signing succeeds, run:

```sh
npx react-native run-ios --device "Sasi Kiran"
```

The error `Signing for "Progress" requires a development team` means this
selection is missing. Reinstalling npm packages or Pods does not supply a team.
See [Apple's device-running guide](https://developer.apple.com/documentation/Xcode/running-your-app-on-simulated-or-physical-devices).

## Environment configuration

The account screens open without a `.env`, but submissions are disabled. Copy
`.env.example` to `.env` locally and enter the project's HTTPS Supabase URL and
public anon/publishable client key. Never use a service-role or secret key.

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-public-client-key
```

`react-native-config` exposes these values at build time. Rebuild the native app
after changing them; Metro reload alone is insufficient. The real `.env` and its
variants are ignored by Git. Bundled configuration is extractable from a mobile
binary, so authorization must always be enforced by Supabase RLS.

`src/lib/environment.ts` validates missing and malformed configuration.
`src/lib/supabase.ts` exports a client only for valid configuration; otherwise it
exports `null`, and account setup remains unavailable. “Connection configured” means
configuration passed local validation, not that a server request succeeded.

Phase 1 stores sessions in native secure storage, refreshes them while the app
is active, and gates authenticated navigation. Configure the email redirects
and complete the live-account checklist in [Phase 1 setup](docs/PHASE_1.md).
No application tables or storage buckets are created in this phase.

## Android

Configure `JAVA_HOME` and `ANDROID_HOME` for your machine. This repository uses
Gradle 9.4.1; the Android settings currently request API 37, Build Tools 37.0.0,
and NDK 27.1.12297006. Install matching components in Android Studio's SDK Manager
and create a virtual device in Device Manager.

On the development Mac, Android Studio's bundled Java can be selected with:

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
npm run android
```

Build without an emulator using `cd android && ./gradlew :app:assembleDebug`.
Local SDK paths belong in your shell or ignored `android/local.properties`.
Release signing is still the starter's debug configuration and must be replaced
in the release-readiness phase.

## Structure

```text
src/
  components/   Shared buttons, text, screens, inputs, feedback, and entrance motion
  hooks/        Reduced-motion preference
  lib/          Environment, Supabase client, query client, and app providers
  navigation/   Root stack, five tabs, route types, and consistent native icons
  screens/      Authentication and Home, Workout, Nutrition, Progress, You screens
  services/     Auth, workout, progress, photos, profile, and nutrition operations
  theme/        Colors, typography, spacing, radii, and motion tokens
```

Create other feature folders as they become necessary. The root navigator opens
auth when signed out, password recovery for reset sessions, or the preview when
signed in after completing onboarding. Home now loads the saved profile, weight
summary, and recent completed workout (when the workouts table exists). See
[Phase 2 profile setup](docs/PHASE_2.md), [Phase 3 details](docs/PHASE_3.md), [Phase 4 setup](docs/PHASE_4.md), and [Phase 5 Progress setup](docs/PHASE_5.md) for checks,
database deployment, and workout persistence behavior.
Native project folders remain under version control.

## Design and implementation decisions

- Black background, restrained dark surfaces, white text, and lime `#B8FF3D` accents.
- Secondary readable text uses `#A1A1A1`; `#666666` is reserved for decoration.
- System fonts, scalable text, scrollable screens, safe areas, labelled tabs,
  and a minimum 56-point height for shared buttons and inputs.
- Core React Native Animated handles short press and entrance animations. Reduce
  Motion is respected; no additional animation or haptics dependency is installed.
- Tab icons are small native-view drawings with consistent dimensions and stroke.
- TanStack Query owns future server data. App foreground state is connected to
  its focus manager. Connectivity integration can be added with real queries.
- Shared mutation retries are disabled to avoid silently duplicating writes.
- React Hook Form and Zod handle account forms; Keychain/Android Keystore-backed
  storage holds sessions. Photos use private Supabase Storage; haptics remain deferred.

## Checks

```sh
npm run typecheck
npm run lint
npm run format:check
npm test -- --runInBand --watchman=false
```

Tests exercise auth navigation, validation, service errors, recovery links,
session restoration, secure-storage calls, button busy state, environment
validation, and Supabase client initialization without contacting a backend. Native modules
are mocked for Jest; native builds and simulator checks remain necessary.

See `PROGRESS_APP_SPEC.md` for product scope. The approved dark visual direction
and Phase 0 decisions above supplement it. Current verification evidence is in
`docs/PHASE_0.md` and `docs/PHASE_1.md`.
