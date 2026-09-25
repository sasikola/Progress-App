# Phase 1 — Authentication

## Implemented scope

- Welcome, create account, sign in, forgot password, and new-password screens.
- Typed React Hook Form inputs with Zod validation, inline errors, busy states,
  keyboard avoidance, secure password fields, and accessible labels.
- Supabase email/password operations. Email-confirmation-required and immediate
  session responses are both supported, according to project configuration.
- Native secure session persistence, startup restoration with retry, foreground
  token refresh, auth-state subscription cleanup, and sign-out from the You tab.
- Auth navigation is replaced after login/logout, so Back cannot expose the
  previous account screens. Cached query data is cleared when user identity changes.
- Confirmation and recovery links work through native URL handlers on both
  platforms. Cold-start links are handled before normal content is shown.
- Recovery mode is persisted separately so restarting during reset returns to
  the new-password form. Successful update allows Continue; cancellation signs out.
- Missing configuration disables account submissions rather than faking success.

This phase does not create profiles, onboarding, workouts, sets/reps, charts,
application tables, RLS policies, photo storage, social login, or biometrics.
Authenticated users temporarily land in the existing foundation-preview tabs.

## Required Supabase setup

1. Create/use your Supabase project and enable the email/password provider.
2. Copy `.env.example` to local `.env`. Set `SUPABASE_URL` to the project HTTPS
   URL and `SUPABASE_ANON_KEY` to its public anon or publishable key. Never put a
   service-role/secret key in the app. Do not commit `.env` or paste secrets in logs.
3. In Authentication URL Configuration, allow these exact redirect URLs:
   - `progress://auth/confirm`
   - `progress://auth/recovery`
4. Keep confirmation/reset templates compatible with Supabase's standard
   `{{ .ConfirmationURL }}` verification links and the requested redirect URL.
   Templates that replace this with a website-only link or OTP entry flow need
   matching app work; those flows are not implemented here.
5. Choose whether account email confirmation is required. Test the selected
   setting. Use an appropriate email-delivery/SMTP configuration before release.
6. Set a backend password policy consistent with your product. The client requires
   eight characters for new passwords and exact confirmation; Supabase remains
   authoritative for stronger policy. Sign-in accepts existing passwords without
   imposing the new-password minimum. Passwords are never trimmed.
7. Install native dependencies and rebuild; a Metro reload does not load changed
   `.env` values or the new Keychain module:

   ```sh
   npm install
   cd ios
   bundle exec pod install
   cd ..
   npm run ios -- --device "Sasi Kiran"
   ```

For simulator use, substitute `--simulator "iPhone 17 Pro"`. Android uses
`npm run android` after the SDK/JDK setup in the README. Keep existing iOS signing.

## Session and link contract

The SDK uses its implicit email-link flow. Supabase verifies the email link first,
then redirects to the native scheme with access/refresh tokens in the URL fragment.
The app accepts only the `progress` scheme, `auth` host, and `/confirm` or `/recovery`
paths. It passes tokens to Supabase `setSession`; malformed/expired links produce
a safe error. No tokens or full callback URLs are logged. PKCE, OTP entry,
universal links, and Android App Links are not implemented.

Custom schemes are suitable for this development flow but do not prove exclusive
app ownership. Before production, consider verified HTTPS universal/app links
and PKCE if the deployment threat model requires stronger redirect protection.

Sessions use `react-native-keychain`, not AsyncStorage. iOS entries use
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`; Android uses the library's Keystore-backed
storage. Device lock/storage errors are surfaced, never downgraded to plaintext.
Keychain entries can survive an iOS uninstall; use explicit sign-out for reliable
account removal. Sign-out uses Supabase's local-session scope, not every device.
If sign-out fails, the UI offers an error and retry instead of claiming success.

Signup/reset success copy does not disclose whether an email address is registered.
Unexpected service errors are mapped to friendly messages without exposing raw
backend responses. There is no profile table access or authorization policy change.

## Verification and remaining acceptance

Verified locally on 2026-09-23:

- TypeScript, ESLint, formatting, and 35 Jest tests (9 suites) passed.
- CocoaPods installed the Keychain native dependency successfully.
- iOS Debug simulator build succeeded for iPhone 17 Pro / iOS 26.5.
- iOS simulator installation/launch succeeded; the welcome screen and missing-
  configuration warning were visually confirmed. The first launch could not find
  Metro; relaunching after Metro was ready resolved it without a native code change.
- Both iOS and Android JavaScript bundles compiled through Metro after the Babel fix.
- Android Debug build succeeded for x86_64; emulator/device launch is not verified.
- Existing iOS development-team and bundle-identifier settings were preserved.

The Metro check exposed Zod's namespace-export syntax; Babel now explicitly uses
[`@babel/plugin-transform-export-namespace-from`](https://babeljs.io/docs/babel-plugin-syntax-export-namespace-from)
to transform it. Restart Metro after pulling this configuration change.

Automated checks cover form schemas, auth-service calls/errors, secure-storage
adapter behavior, URL parsing, restored/recovery sessions, auth subscription cleanup,
foreground refresh, cache clearing, and navigation without backend configuration.
Jest mocks native modules and service responses: it does not prove live email
delivery, native encrypted storage across restarts, or backend connectivity.

Run the following with your configured project and a test account you control:

- Create an account; confirm email if required; verify it opens the app.
- Reject invalid email, short/mismatched passwords, and incorrect login credentials.
- Sign in; background/foreground; force-close and reopen; verify session restoration.
- Sign out; reopen; verify the welcome screen and no previous-user content.
- Request a reset for known and unknown addresses; both should use neutral copy.
- Open reset mail with app closed, then with app already running; both must show
  the new-password screen. Restart before saving; verify recovery stays gated.
- Update password; sign out; verify the old password fails and the new one works.
- Cancel recovery; verify it signs out. Try an expired/malformed link and retry.
- Test offline requests and recovery from a connection/storage failure.
- Test a small device, large text, keyboard scrolling, Reduce Motion, and VoiceOver.

Live-account acceptance remains pending until `.env`, redirect allowlist, and
email delivery are configured. Workout entry remains outside Phase 1.
