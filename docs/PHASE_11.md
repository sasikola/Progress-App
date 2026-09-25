# Phase 11 — Barcode scanning (Milestone 2 completion)

Completes the barcode-lookup path from [Phase 10](docs/PHASE_10.md): instead
of only typing a barcode number, the user can now scan one with the camera.
The backend (`get-food-by-barcode`, Open Food Facts normalization, caching)
is unchanged — this phase is purely a native camera dependency and a new
screen that decodes a barcode and calls the same lookup already in place.

## Library choice

`react-native-vision-camera` (the more commonly recommended camera library)
was evaluated and **not** used: even its built-in barcode scanner lists
`react-native-reanimated`, `@shopify/react-native-skia`, and
`react-native-worklets-core` as peer dependencies, and it requires Android
`minSdkVersion` 26 (this project is 24 — bumping it would drop Android 7.x
device support). None of that capability (frame processors, Skia-rendered
overlays, worklet-based frame pipelines) is needed to decode a barcode.

`react-native-camera-kit` was used instead: zero extra native dependencies
(only `react`/`react-native` as peers), built-in `onReadCode` barcode
scanning, and Android `minSdkVersion` 21+ (no bump needed). Trade-off: its
own README has deprecated its permission-prompt API in favor of a separate
permissions library (`react-native-permissions`), recommending it for new
integrations. Adding that library back would undercut the whole reason
camera-kit was chosen (minimal footprint), so this phase uses the
still-present (if soft-deprecated) `CameraApi.requestDeviceCameraAuthorization`
method instead — see the comment in `BarcodeScanner.tsx` for exactly where
to look if a future camera-kit major version removes it.

## Setup

1. Native dependency already added to `package.json`
   (`react-native-camera-kit`). On a fresh checkout: `npm install`.
2. iOS: `cd ios && bundle exec pod install`. `NSCameraUsageDescription` in
   `Info.plist` was updated to mention both progress photos and barcode
   scanning (a single camera permission covers both features).
3. Android: `android.permission.CAMERA` was added to `AndroidManifest.xml`.
   Unlike the photo picker (which launches the system camera app via an
   intent), camera-kit renders a live in-app preview, which needs this
   declared and is requested at runtime by
   `requestDeviceCameraAuthorization`.
4. Rebuild the native app — Fast Refresh cannot load the new native module:

   ```sh
   npx react-native run-ios --device
   # or
   npx react-native run-android
   ```

## Implementation

- `src/screens/nutrition/BarcodeScanner.tsx`: `BarcodeScannerView` (camera
  preview, permission flow, ignores non-numeric codes like QR so only
  product barcodes reach the lookup) and `ScanBarcodePanel` (owns the
  scanned-code → lookup → found/not-found/error state machine, wrapping
  `BarcodeScannerView` and reusing the same `useLookupBarcode` hook the
  manual-entry field already used).
- `Camera` is `React.lazy`-loaded internally by the package (it dynamically
  imports a `.ios`/`.android` file per platform), so it's rendered inside a
  `<Suspense>` boundary — missing that would produce a runtime warning/crash
  the type definitions don't surface.
- The scanner replaces the whole screen (its own `SafeAreaView`, no scroll)
  rather than rendering inside the shared `Screen` component every other
  nutrition view uses, since a camera preview needs the full frame, not a
  padded scrollable container.
- `Nutrition → Add food → Have a barcode? → Scan barcode` opens the camera;
  "Or enter it manually" (the existing text field) is left in place as a
  fallback for a damaged barcode or a camera-less test environment.

## Verification

Commands:

```sh
npm run typecheck
npm run lint
npm test -- --runInBand --watchman=false
```

`__tests__/BarcodeScanner.test.tsx` covers the permission flow (granted/
denied), ignoring a non-numeric scanned code, the found/not-found/error
states, and "Scan again". `jest.setup.js` mocks `react-native-camera-kit`
with a plain (non-lazy) component so tests don't need real camera hardware
or a Suspense-aware test renderer setup; the mock exposes
`__mockRequestDeviceCameraAuthorization` so a test can simulate a denied
permission. None of this exercises the real native camera, a real device's
permission dialog, or actual barcode decoding — that's device-only.

Still required on the device:

1. Grant and deny camera permission on both iOS and Android; confirm the
   "Open Settings" action actually opens the app's settings page.
2. Scan a real product barcode end-to-end and confirm it reaches the same
   detail screen manual entry would.
3. Point the camera at a QR code and confirm it's silently ignored (no
   lookup attempt, no error) rather than treated as a barcode.
4. Confirm Fast Refresh alone does not suffice after `npm install` — a full
   native rebuild is required for the new module to load.
