Progress — React Native CLI + Codex Development Specification

1. Project Overview

App name: Progress
Tagline: Train. Track. Progress.

Progress is an iOS-first fitness tracking application that helps users consistently record workouts and visualize measurable progress over time.

The first version should be a clean, production-oriented React Native application using React Native CLI, not Expo.

Core product loop

Train → Track → Compare → Understand → Progress

Primary MVP capabilities

Authentication

User onboarding

Workout logging

Exercise and set tracking

Workout history

Body-weight tracking

Body measurements

Progress photos

Personal records

Progress dashboard

User profile/settings

2. Critical Development Rules for Codex

Codex should treat this file as the primary source of truth for the application.

Non-negotiable rules

Use React Native CLI, not Expo.

Do not install or introduce Expo unless explicitly requested.

Use TypeScript throughout the application.

Keep native iOS and Android projects under version control.

Do not replace native folders with Expo prebuild.

Prefer small, testable changes over large rewrites.

Before changing architecture, explain the reason and impact.

Do not invent database tables, fields, APIs, or business rules when they are not specified.

Reuse existing components and utilities before creating duplicates.

Keep business logic out of UI components where practical.

Do not hard-code Supabase credentials in source code.

Never commit secrets.

Run TypeScript checks, linting, and relevant tests after meaningful changes.

When a build fails, fix the root cause rather than repeatedly changing unrelated files.

Keep iOS and Android compatibility in mind even though iOS is the initial priority.

Do not mark a feature complete until it has been manually or automatically verified.

3. Technology Stack

Core

React Native CLI

TypeScript

React Native

Node.js

npm

Navigation

Use React Navigation:

@react-navigation/native

@react-navigation/native-stack

@react-navigation/bottom-tabs

Backend

Supabase

@supabase/supabase-js

Supabase provides:

Authentication

PostgreSQL database

Row Level Security

Storage for progress photos

State / Server State

TanStack Query

Use TanStack Query for server state and asynchronous data fetching.


Avoid adding a global state library unless there is a clear requirement.

Forms

React Hook Form

Zod

@hookform/resolvers

Native functionality

Use maintained React Native-compatible libraries when native capabilities are required.

Potential areas:

Camera

Photo library

Image handling

Secure storage

Keyboard handling

Do not add native dependencies unless the feature requires them.

4. Project Structure

Use a feature-oriented structure.

Progress/
├── android/
├── ios/
├── src/
│   ├── components/
│   │   ├── common/
│   │   ├── buttons/
│   │   ├── cards/
│   │   ├── inputs/
│   │   └── feedback/
│   │
│   ├── screens/
│   │   ├── auth/
│   │   ├── onboarding/
│   │   ├── home/
│   │   ├── workout/
│   │   ├── progress/
│   │   └── profile/
│   │
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── AuthNavigator.tsx
│   │   ├── OnboardingNavigator.tsx
│   │   └── MainTabNavigator.tsx
│   │
│   ├── hooks/
│   │
│   ├── services/
│   │   ├── auth/
│   │   ├── workouts/
│   │   ├── progress/
│   │   └── profile/
│   │
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── queryClient.ts
│   │
│   ├── types/
│   │
│   ├── utils/
│   │
│   ├── constants/
│   │
│   └── theme/
│       ├── colors.ts
│       ├── typography.ts
│       ├── spacing.ts
│       └── index.ts
│
├── App.tsx
├── package.json
├── tsconfig.json
├── .env.example
└── README.md

Keep the structure understandable. Do not create folders merely for the sake of abstraction.

5. Application Navigation

Root flow

App Launch
   │
   ├── Loading
   │
   ├── No authenticated session
   │       └── Auth
   │
   ├── Authenticated but onboarding incomplete
   │       └── Onboarding
   │
   └── Authenticated + onboarding complete
           └── Main App

Main tabs

Home
Workout
Progress
You

6. Authentication

Screens

Welcome

Purpose:

Introduce Progress

Explain the product simply

Provide sign-in and sign-up actions

Sign Up

Fields:

Email

Password

Confirm password

Validation:

Valid email

Minimum password requirements

Password confirmation matches

Sign In

Fields:

Email

Password

Actions:

Sign in

Forgot password

Create account

Password reset

Allow a user to request a password reset through Supabase.

7. Onboarding

After authentication, users who have not completed onboarding should enter onboarding.

Step 1 — Profile

Collect:

Name

Optional profile information

Step 2 — Goal

Example goals:

Build muscle

Lose fat

Get stronger

Improve fitness

Maintain

Goals should be stored as structured data, not only display text.

Step 3 — Optional weight

Allow the user to enter current body weight.

Weight must include a unit.

Support:

kg

lb

Step 4 — Complete

Save onboarding state and navigate to Home.

Users should not repeatedly see onboarding once completed.

8. Home Screen

The Home screen is the user's main dashboard.

Show:

Greeting

Current goal

Current weight when available

Quick workout action

Recent workout summary

Recent progress summary

Personal-record highlights

Progress photo reminder when appropriate

Primary CTA:

Start Workout

Keep the Home screen useful without becoming visually crowded.

9. Workout System

Workout logging is the central feature of the MVP.

Workout flow

Workout Tab
    ↓
Start Workout
    ↓
Exercise Picker
    ↓
Active Workout
    ↓
Log Sets
    ↓
Finish Workout
    ↓
Workout Summary
    ↓
Workout History

Exercise picker

Users should be able to:

Search exercises

Browse exercises

Select an exercise

Add multiple exercises

Each exercise should have enough information to understand what is being tracked.

Initial examples:

Bench Press

Squat

Deadlift

Overhead Press

Barbell Row

Pull Up

Lat Pulldown

Dumbbell Curl

Triceps Pushdown

Leg Press

The exercise catalog should be data-driven.

10. Active Workout

Display:

Workout duration

Exercise list

Current exercise

Previous performance where available

Sets

Reps

Weight

Completed state

For each set:

Set number
Weight
Reps
Completed

Example:

Set 1   60 kg   10 reps   ✓
Set 2   60 kg   10 reps   ✓
Set 3   65 kg    8 reps   ✓

Allow:

Add set

Edit set

Delete set

Complete set

Add exercise

Remove exercise

Do not lose an active workout accidentally.

11. Workout Summary

After finishing a workout show:

Workout duration

Exercises completed

Total sets

Total volume when calculable

Personal records achieved

Short summary

Example:

Workout Complete

45 min
5 exercises
16 sets

New PR
Bench Press — 70 kg × 8

Total Volume
4,820 kg

12. Workout History

Users should be able to view previous workouts.

Each history item should show:

Date

Duration

Exercise count

Set count

Volume when available

Selecting a workout opens its details.

13. Progress System

Progress should provide measurable long-term feedback.

Progress sections

Progress
├── Overview
├── Weight
├── Measurements
├── Photos
└── Records

14. Weight Tracking

Users can log body weight.

Each entry contains:

Weight

Unit

Date/time

Display:

Current weight

Previous weight

Change over time

Historical chart

The UI should make trends easy to understand.

Do not imply medical conclusions from weight data.

15. Body Measurements

Allow tracking of measurements such as:

Chest

Waist

Hips

Left arm

Right arm

Left thigh

Right thigh

Each measurement should contain:

Measurement type

Value

Unit

Date

Users should be able to view historical changes.

16. Progress Photos

Users can create a visual progress timeline.

Photo categories:

Front

Side

Back

Flow:

Add Photo
   ↓
Select Category
   ↓
Camera / Photo Library
   ↓
Preview
   ↓
Upload
   ↓
Timeline

Requirements:

Request permissions appropriately.

Show useful permission-denied states.

Compress images when appropriate.

Upload through Supabase Storage.

Store metadata in the database.

Do not expose another user's private photos.

Respect Row Level Security.

Compare

Allow users to select two photos and compare them.

Comparison can be:

Side-by-side

Before / After

Keep the first implementation simple.

17. Personal Records

Track strength records based on workout data.

Examples:

Highest weight

Highest reps at a weight

Estimated 1RM if explicitly implemented

Initial MVP should prioritize directly recorded achievements.

Example:

Bench Press
70 kg × 8

Squat
100 kg × 5

Deadlift
140 kg × 3

Avoid presenting calculated estimates as factual achievements without clearly labeling them.

18. Profile / You

The You tab should contain:

Profile information

Goal

Units/preferences

Account settings

Sign out

Possible later additions:

Notification preferences

Theme

Privacy settings

Do not overbuild the settings screen in MVP.

19. Database Model

Use Supabase PostgreSQL.

A suggested initial model:

profiles

id
user_id
name
goal
onboarding_completed
created_at
updated_at

weight_entries

id
user_id
weight
unit
recorded_at
created_at

exercises

id
name
category
description
created_at

workouts

id
user_id
started_at
completed_at
duration_seconds
created_at

workout_exercises

id
workout_id
exercise_id
order_index
created_at

workout_sets

id
workout_exercise_id
set_number
weight
weight_unit
reps
completed
created_at

measurements

id
user_id
measurement_type
value
unit
recorded_at
created_at

progress_photos

id
user_id
photo_type
storage_path
recorded_at
created_at

The schema may be adjusted when implementation reveals a genuine requirement, but Codex must document schema changes.

20. Supabase Security

Row Level Security is mandatory for user-owned data.

Users must only be able to access their own:

Profile

Weight entries

Workouts

Workout sets

Measurements

Progress photos

Exercise catalog data may be publicly readable if appropriate.

Never bypass RLS from the client.

Never put the Supabase service-role key in the mobile application.

21. Environment Variables

Use environment configuration.

Create:

.env.example

Example:

SUPABASE_URL=
SUPABASE_ANON_KEY=

The real .env must not be committed.

If the chosen React Native environment does not expose .env values automatically, use an appropriate React Native environment-variable solution rather than hard-coding credentials.

22. Design System

The visual identity should feel:

Modern

Clean

Focused

Athletic

Premium

Easy to scan

Avoid:

Excessive gradients

Excessive animations

Clutter

Tiny text

Overly decorative UI

Design principles

Spacing

Use a consistent spacing scale.

Example:

4
8
12
16
20
24
32
40
48

Border radius

Use consistent radius values.

Example:

8
12
16
20

Typography

Use a clear hierarchy:

Large screen title

Section heading

Card title

Body

Secondary text

Caption

Buttons

Primary actions should be visually obvious.

Examples:

Start Workout

Add Exercise

Finish Workout

Log Weight

Add Photo

23. Reusable Components

Create reusable components when repetition appears.

Potential components:

Button
TextInput
Card
Screen
SectionHeader
EmptyState
LoadingState
ErrorState
WorkoutCard
ExerciseRow
SetRow
ProgressCard
MetricCard
PhotoCard
StatCard

Do not create a component abstraction for a single trivial element unless it improves readability.

24. Error Handling

Every network operation needs useful states.

Support:

Loading
Success
Empty
Error
Retry

Errors should be understandable to normal users.

Avoid showing raw technical errors whenever possible.

Example:

Bad:

PostgrestError: relation profiles violates...

Better:

We couldn't save your profile.
Please try again.

Log technical details appropriately for development.

25. Loading States

Do not leave blank screens during network operations.

Use:

Skeletons

Loading indicators

Disabled buttons

Progress indicators

Avoid unnecessary full-screen spinners.

26. Empty States

Every list needs an intentional empty state.

Examples:

No workouts

No workouts yet

Start your first workout and your progress will appear here.

[Start Workout]

No weight entries

No weight data yet

Log your first weigh-in to start tracking your trend.

[Log Weight]

No photos

No progress photos yet

Take your first photo to build your visual progress timeline.

[Add Photo]

27. Accessibility

The app should support:

Dynamic text where practical

Accessible labels

Sufficient contrast

Large touch targets

Clear focus/interaction states

Meaningful screen-reader descriptions

Do not rely on color alone to communicate state.

28. Performance

Priorities:

Fast initial rendering

Efficient lists

Avoid unnecessary re-renders

Cache server data with TanStack Query

Compress large images

Avoid loading entire workout history at once

Use appropriate list components

Do not prematurely optimize without evidence.

29. Offline / Network Considerations

MVP does not need a complete offline-first architecture.

However:

Never silently discard workout data.

Handle temporary network failures.

Preserve active workout state where practical.

Inform the user when an operation fails.

A future version may add stronger offline support.

30. Testing Strategy

At minimum, test:

Authentication

Sign up

Sign in

Sign out

Invalid credentials

Password reset

Onboarding

Complete onboarding

Validation

Persistence

Workout

Create workout

Add exercise

Add sets

Edit sets

Complete sets

Finish workout

View history

Progress

Add weight

View weight history

Add measurements

Upload photo

View photo timeline

Compare photos

View records

31. MVP Acceptance Criteria

The MVP is complete when a new user can:

Install app
   ↓
Create account
   ↓
Complete onboarding
   ↓
Reach Home
   ↓
Start workout
   ↓
Choose Bench Press
   ↓
Log 3 sets
   ↓
Finish workout
   ↓
See workout summary
   ↓
See workout in History
   ↓
Log body weight
   ↓
View weight progress
   ↓
Add a progress photo
   ↓
View photo timeline

This is the primary end-to-end acceptance flow.

32. Development Phases

Codex should implement the app in phases.

Phase 0 — Project Setup

Tasks:

Create React Native CLI project

Configure TypeScript

Configure iOS

Configure Android

Configure navigation

Configure environment variables

Configure Supabase

Configure TanStack Query

Configure linting/formatting

Establish folder structure

Create base theme

Acceptance:

App launches on iOS simulator

App launches on Android emulator

Navigation foundation works

Supabase client initializes

Phase 1 — Authentication

Implement:

Welcome

Sign Up

Sign In

Password reset

Session restoration

Sign out

Acceptance:

User can create an account

User can sign in

Session survives app restart

User can sign out

Phase 2 — Onboarding

Implement:

Profile

Goal

Weight

Completion state

Acceptance:

New user completes onboarding

Data is persisted

Returning user skips onboarding

Phase 3 — Home

Implement:

Greeting

Goal

Weight summary

Start Workout

Recent workout

Progress highlights

Acceptance:

Home loads correctly from Supabase

Empty states work

Start Workout works

Phase 4 — Workout

Implement:

Exercise picker

Active workout

Set logging

Exercise management

Finish workout

Workout summary

History

Acceptance:

Full workout flow works end-to-end

Data is persisted correctly

History displays completed workouts

Phase 5 — Progress

Implement:

Overview

Weight

Measurements

Records

Acceptance:

Users can enter data

Historical data displays correctly

Charts/trends are readable

Phase 6 — Photos

Implement:

Camera/photo library

Permissions

Upload

Timeline

Before/after comparison

Acceptance:

User can upload a photo

Photo is stored securely

Timeline loads photos

User can compare two photos

Phase 7 — Polish

Implement:

Loading states

Error states

Empty states

Accessibility

Performance improvements

Visual consistency

Animations only where useful

Phase 8 — Release Readiness

Verify:

Production environment

Supabase RLS

No secrets committed

iOS signing

Android signing

App icon

Launch screen

Permissions

Privacy requirements

Build configuration

33. Codex Working Method

For every feature:

Step 1 — Inspect

Before changing code:

Inspect the relevant files.

Understand existing architecture.

Check package versions.

Check navigation.

Check database assumptions.

Step 2 — Plan

State:

What will change

Which files will change

Any new dependencies

Any database changes

Any native changes

Step 3 — Implement

Make the smallest coherent implementation.

Step 4 — Verify

Run appropriate commands.

Typical checks:

npm run lint
npx tsc --noEmit

For iOS:

cd ios
pod install
cd ..
npx react-native run-ios

For Android:

npx react-native run-android

Use the actual scripts available in package.json.

Step 5 — Report

After implementation, summarize:

Files changed

Features implemented

Tests/checks run

Remaining issues

Recommended next step

34. Git Strategy

Use small commits.

Example:

chore: initialize React Native project
feat: add authentication flow
feat: add onboarding
feat: add home dashboard
feat: add workout logging
feat: add workout history
feat: add weight tracking
feat: add measurements
feat: add progress photos
feat: add personal records
fix: handle workout save failure

Do not mix unrelated features in one commit.

35. Rules for Native iOS Changes

Because this is React Native CLI:

Native iOS code is allowed.

Native iOS configuration should be committed.

CocoaPods is expected.

Xcode project/workspace changes are expected.

Do not use Expo native modules.

If a native dependency is added, explain why.

After native dependency changes, run CocoaPods.

36. Rules for Android Changes

Keep Android project healthy even though iOS is first.

Do not make unnecessary Android-specific changes.

Keep Gradle configuration compatible with the selected React Native version.

Verify Android builds periodically.

37. Security Rules

Never:

Commit passwords

Commit service-role keys

Put private Supabase credentials in source

Disable RLS just to make development easier

Expose another user's data

Store sensitive data in plain text unnecessarily

Always:

Validate user input

Use RLS

Handle authentication state safely

Protect user photos

Validate uploaded content where appropriate

38. Product Scope Rules

MVP should remain focused.

Do NOT add unless explicitly requested:

Social feed

Following/followers

Messaging

Public profiles

AI coach

Meal tracking

Nutrition database

Wearable integrations

Gym marketplace

Payments

Subscription system

Complex workout programming

Community features

These may become future roadmap features.

39. Future Roadmap

Possible post-MVP features:

Workout templates

Exercise history graphs

Advanced strength analytics

Personal training plans

Rest timers

Superset support

Workout reminders

Push notifications

Apple Health integration

Wearable integrations

Advanced photo comparison

Export progress data

Cloud backup improvements

Do not implement these during MVP unless explicitly requested.

40. Definition of Done

A feature is done only when:

TypeScript passes

Lint passes where configured

Relevant tests pass

UI works on the target platform

Loading state exists

Error state exists

Empty state exists where applicable

Supabase queries are secure

RLS is correct

No secrets are committed

Existing functionality still works

The feature matches this specification

41. First Task for Codex

Start by inspecting the repository.

Do NOT immediately build all features.

First determine:

Current working directory

Whether this is a new or existing project

Node version

npm version

React Native CLI availability

Xcode availability

CocoaPods availability

iOS project state

Android project state

Existing source files

Then propose the smallest setup plan.

After approval, implement Phase 0 only.

Do not start authentication, workouts, progress tracking, or other product features until the foundation is working.

42. Recommended First Codex Prompt

Use this prompt when starting the project:

Read PROGRESS_APP_SPEC.md completely before making changes.

We are building Progress — Train. Track. Progress. as a production-oriented React Native CLI application.

Do not use Expo.

First inspect the repository and local development environment. Determine the current project state, React Native version, Node/npm versions, Xcode state, CocoaPods state, iOS project state, Android project state, and existing source structure.

Do not implement product features yet.

Create a concise implementation plan for Phase 0 only:

React Native CLI foundation

TypeScript

navigation foundation

Supabase client

TanStack Query

environment configuration

base theme

project structure

lint/format/type-check setup

Before modifying anything, explain what you found and what you intend to change.

After implementation, run the relevant checks and report:

files changed

dependencies added

commands executed

checks passed/failed

remaining setup issues

Do not move to Phase 1 until Phase 0 is verified.

43. Product Principle

Progress should make fitness tracking feel simple enough to use consistently.

The app should answer three questions quickly:

What did I do?

How am I progressing?

What should I track next?

Every feature should support the core product loop:

Train → Track → Compare → Understand → Progress

44. Nutrition, Calorie & Macro Tracking (addendum)

Section 38 originally excluded meal/nutrition tracking from MVP scope unless
explicitly requested. It was explicitly requested afterward, so this section
documents the resulting schema and scope change per the change-management
rule in section 19 ("Codex must document schema changes").

Expanded product loop:

Train → Track → Eat → Compare → Understand → Progress

New tables (see supabase/migrations/202609260001_phase9_nutrition.sql and
docs/PHASE_9.md for full detail): `foods` (a shared, provider-populated
nutrition cache — USDA FoodData Central today; Open Food Facts and
user-created custom foods are reserved sources for later milestones),
`food_entries` (a per-user log of consumed foods; stores a nutrition
snapshot at logging time so a later catalog correction never rewrites
history), and `nutrition_targets` (versioned calorie/macro goals, by
`effective_from`, mirroring how weight/measurement history already works).

Milestone 1 (implemented): nutrition schema/RLS/RPCs, a `search-foods`
Supabase Edge Function backed by USDA FoodData Central (the USDA API key is
a server-side function secret, never bundled into the app), a normalized
cross-provider food model, food search/detail/serving screens, add/edit/
delete food entries, daily calorie and macro totals with a settable target
(with an optional, clearly-labeled Mifflin-St Jeor estimate), and a new
`Nutrition` tab between Workout and Progress. Also surfaced nutrition on
the Home dashboard (a card between "Start Workout" and "Latest weight",
matching this section's own ordering) as a Milestone 1 polish pass.

Milestone 2 (implemented): Open Food Facts as a barcode-lookup provider
(manual entry and camera scanning — see below), recent foods (grouped from
the caller's own `food_entries`, most-recently-used first), favorite foods
(idempotent toggle, owner-scoped), and user-created custom foods (entered
per 100 g, private to their creator, reusing the `foods.created_by`/
`source = 'custom'` architecture laid down in Milestone 1). See
docs/PHASE_10.md for the full detail, including two real bugs found and
fixed in the Milestone 1 USDA integration (an `ON CONFLICT` target that
didn't match a partial unique index, and no sanity-range check on external
nutrient values) and the test coverage added specifically to catch a repeat
of either class of bug in the Open Food Facts integration.

Milestone 2 completion (implemented): barcode **scanning** via the camera,
using `react-native-camera-kit` — chosen over the more commonly recommended
`react-native-vision-camera` specifically to avoid dragging in
`react-native-reanimated`/`@shopify/react-native-skia`/
`react-native-worklets-core` as peer dependencies and an Android
`minSdkVersion` bump (26 vs. this project's 24), none of which barcode
decoding alone needs. See docs/PHASE_11.md for the full trade-off writeup.
The scanner calls the exact same `get-food-by-barcode` function manual
barcode entry already used, confirming the Phase 10 architecture note that
no schema or Edge Function change would be required for this.

Deferred: nutrition history/weekly charts and deeper Home-dashboard
integration (beyond the calorie/protein card already shipped) remain future
milestones per the original master implementation prompt.