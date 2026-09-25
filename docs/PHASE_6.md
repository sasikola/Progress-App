# Phase 6 — Private progress photos

## Setup

1. Run **all** of `supabase/migrations/202609250003_phase6_photos.sql` in the
   project's Supabase SQL Editor as administrator. It creates/configures the
   private `progress-photos` bucket, metadata and Storage policies, and upload RPCs.
   Existing tables missing `recorded_at` are upgraded before the timeline index
   is created. Missing photo dates fall back to the existing `created_at`
   timestamp (record creation, not necessarily capture time); known photo dates
   are never replaced. If neither date is available for an existing row, the
   migration stops and rolls back instead of inventing a date or deleting photos.
2. Dependencies are in `package.json`/`package-lock.json`; the image-picker iOS pod
   has been installed in this workspace. On a fresh checkout, run `npm install`
   then `cd ios && bundle exec pod install`.
3. Rebuild the development app from the repository root:

   ```sh
   npx react-native run-ios --device
   ```

   Fast Refresh alone cannot load the new native image-picker module or iOS
   camera/library permission descriptions. Keep your existing signing team.

4. Open **Progress → Photos**. Choose Front, Side or Back, date, camera/library,
   review the preview, then tap **Upload privately**. Select two same-category
   timeline photos for comparison; chronological order determines Before/After.

## Implementation and privacy

- Native system photo picker/camera, one still image per selection. Requests
  resizing to 1600×1600 maximum and JPEG quality 0.8, compatible HEIC conversion,
  no extra asset metadata, and no automatic camera save to the public library.
  JPEG/PNG file signatures and a 5 MB payload limit are checked before upload.
  We do not claim universal EXIF removal: processing varies by format/platform.
- Permission denial offers Settings; cancellation is quiet; an unavailable
  camera offers the library alternative. No microphone permissions are added.
  Android uses the system picker/camera without broad library/camera permissions
  under the image-picker's documented default flow (`saveToPhotos: false`).
- A private Storage bucket enforces MIME/size limits. Paths begin with the auth
  user ID. Metadata and Storage RLS restrict reads/writes to the owner, including
  restrictive guards against older broad policies. Other buckets are unaffected.
  Legacy metadata is preserved; existing files must already be in the private
  bucket under `<user-id>/<filename>.jpg|jpeg|png` to display in this UI.
- Display uses five-minute signed URLs, refreshed every four minutes while
  visible in the active Progress tab, with a reload action if an image fails. URLs and previews are not
  persisted by the app. Signed links are bearer credentials valid until expiry;
  signing out clears the app query cache but does not revoke already-issued
  links. Native/OS image caching is not a secure-erasure guarantee.
- The app checks the active account before each upload stage. Server functions
  independently verify ownership; timeline queries and cache keys are user-scoped.
- Timeline is paginated in 12-photo pages with Older/Newer navigation, timestamp/ID cursors and category
  filters. Only the current page and selected comparison images are mounted. Only ready metadata appears. Images use `contain`, not crop, for
  neutral comparison. No sharing/public URL generation is included.

## Upload failure behavior and limits

Storage bytes and PostgreSQL metadata cannot share one transaction. Upload is:
reserve pending metadata → upload immutable object → verify object → mark ready.
The same request/path is reused on retry; uploads never overwrite another image.
A duplicate or lost Storage response can still finish if the owned object exists.
If the final response is lost, retrying returns the existing ready photo.

The preview/request is in memory only. Keep the form open and retry unchanged
after network failures. Leaving the section, discarding, or restarting loses the
local draft; pending metadata/objects can remain private on the server. There is
no durable background upload, automatic orphan cleanup, or photo deletion UI in
this phase. Administrators must inspect abandoned pending uploads and use the
Storage API/dashboard for file cleanup—never delete `storage.objects` directly.
The discard action clears only the local preview, not uploaded bytes.

## Verification

Commands:

```sh
npm run typecheck
npm run lint
npm test -- --runInBand --watchman=false
npm run test:photo-db
```

The database check models the Storage SQL schema in local PostgreSQL; it tests
metadata preservation, reruns, private bucket settings, pending/ready behavior,
idempotency, validation, cross-user/anonymous restrictions, immutable objects,
and unrelated bucket access. It does **not** test the live Storage HTTP service,
signed URL delivery, actual image decoding, or native permission dialogs.

Still required on the device/live project:

1. Allow/deny camera and library access; cancel both pickers. Test limited library
   access and HEIC conversion on iOS; use a physical device for the camera.
2. Upload each category; restart and confirm the timeline persists.
3. Compare two same-category dates; check large text and image proportions.
4. Disconnect/reconnect during upload and retry unchanged; verify one timeline row.
5. Test signed-link renewal after five minutes and two-account isolation.
6. Confirm the bucket remains private and anonymous direct access fails.

References: [image-picker setup/options](https://github.com/react-native-image-picker/react-native-image-picker),
[Supabase React Native uploads](https://supabase.com/blog/react-native-storage),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
