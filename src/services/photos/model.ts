import { decode } from 'base64-arraybuffer';
import { z } from 'zod';
import type { Asset } from 'react-native-image-picker';

export const photoOptions = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
] as const;
export type PhotoType = (typeof photoOptions)[number]['value'];
export const photoBucket = 'progress-photos';
export const maxPhotoBytes = 5 * 1024 * 1024;
export const photoSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  client_id: z.string().nullable(),
  photo_type: z.enum(['front', 'side', 'back']),
  storage_path: z.string(),
  recorded_at: z.string().datetime({ offset: true }),
  status: z.enum(['pending', 'ready']),
});
export type ProgressPhoto = z.infer<typeof photoSchema>;
export type SelectedPhoto = {
  uri: string;
  base64: string;
  contentType: 'image/jpeg' | 'image/png';
  byteSize: number;
};
export type PhotoDraft = {
  clientId: string;
  photoType: PhotoType;
  recordedAt: string;
  asset: SelectedPhoto;
};

export function selectedPhoto(asset: Asset | undefined): SelectedPhoto {
  if (!asset?.uri || !asset.base64)
    throw new Error('The photo could not be read. Please choose it again.');
  if (asset.base64.length > Math.ceil(maxPhotoBytes / 3) * 4)
    throw new Error('Choose a smaller photo (maximum 5 MB).');
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(asset.base64) ||
    asset.base64.length % 4 !== 0
  )
    throw new Error('The photo could not be read. Please choose it again.');
  const bytes = new Uint8Array(decode(asset.base64));
  if (!bytes.length || bytes.length > maxPhotoBytes)
    throw new Error('Choose a smaller photo (maximum 5 MB).');
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg)
    throw new Error(
      'Choose a JPEG or PNG photo. Try another image if HEIC conversion failed.',
    );
  return {
    uri: asset.uri,
    base64: asset.base64,
    byteSize: bytes.length,
    contentType: png ? 'image/png' : 'image/jpeg',
  };
}
export function ownedPhoto(value: unknown, userId: string): ProgressPhoto {
  const photo = photoSchema.parse(value);
  const [owner, file, extra] = photo.storage_path.split('/');
  if (
    photo.user_id !== userId ||
    owner !== userId ||
    extra !== undefined ||
    !/^[A-Za-z0-9_-]+\.(jpg|jpeg|png)$/.test(file ?? '')
  )
    throw new Error('Photo ownership does not match this account.');
  return photo;
}
export function comparison(photos: ProgressPhoto[]) {
  if (
    photos.length !== 2 ||
    photos[0].id === photos[1].id ||
    photos[0].photo_type !== photos[1].photo_type
  )
    return null;
  return [...photos].sort(
    (a, b) =>
      Date.parse(a.recorded_at) - Date.parse(b.recorded_at) ||
      a.id.localeCompare(b.id),
  );
}
export function photoError(error: unknown) {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : '';
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code))
    return 'Photo setup is needed. Apply the Phase 6 SQL migration, then retry.';
  if (code === '42501' || code === 'account_changed')
    return 'Sign in to the photo owner account before retrying.';
  return 'The photo request failed. Check your connection and retry. An upload retry uses the same photo; it will not overwrite another image.';
}
