import { photoService } from '../src/services/photos/photoService';
import {
  selectedPhoto,
  comparison,
  ownedPhoto,
  maxPhotoBytes,
  type PhotoDraft,
} from '../src/services/photos/model';
import {
  pickPhoto,
  PhotoPermissionError,
} from '../src/services/photos/photoPicker';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { supabase } from '../src/lib/supabase';
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    rpc: jest.fn(),
    storage: { from: jest.fn() },
    from: jest.fn(),
  },
}));
const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const row = {
  id: '00000000-0000-4000-8000-000000000003',
  user_id: user,
  client_id: 'photo-request-001',
  photo_type: 'front' as const,
  storage_path: user + '/photo-request-001.jpg',
  recorded_at: '2020-01-02T12:00:00Z',
  status: 'pending' as const,
};
const asset = { uri: 'file:///photo.jpg', base64: '/9j/AA==' };
const draft: PhotoDraft = {
  clientId: row.client_id,
  photoType: 'front',
  recordedAt: row.recorded_at,
  asset: selectedPhoto(asset),
};
const upload = jest.fn();
const createSignedUrl = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(supabase!.auth.getSession)
    .mockResolvedValue({
      data: { session: { user: { id: user } } },
      error: null,
    } as never);
  jest
    .mocked(supabase!.storage.from)
    .mockReturnValue({ upload, createSignedUrl } as never);
  upload.mockResolvedValue({ data: {}, error: null });
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://example.test/private' },
    error: null,
  });
  jest
    .mocked(supabase!.rpc)
    .mockImplementation(
      (name: string) =>
        Promise.resolve({
          data:
            name === 'prepare_progress_photo'
              ? row
              : { ...row, status: 'ready' },
          error: null,
        }) as never,
    );
});
test('uploads ArrayBuffer to immutable owned path and finalizes metadata', async () => {
  const result = await photoService.upload(user, draft);
  expect(result.status).toBe('ready');
  expect(upload).toHaveBeenCalledWith(
    row.storage_path,
    expect.any(ArrayBuffer),
    expect.objectContaining({ upsert: false, contentType: 'image/jpeg' }),
  );
  expect(supabase!.rpc).toHaveBeenLastCalledWith('finish_progress_photo', {
    p_user_id: user,
    p_client_id: draft.clientId,
  });
});
test('recovers a duplicate or uncertain Storage response by verifying completion', async () => {
  upload.mockResolvedValue({ data: null, error: { statusCode: '409' } });
  await expect(photoService.upload(user, draft)).resolves.toMatchObject({
    status: 'ready',
  });
});
test('does not hide a failed upload when no object exists', async () => {
  const error = { message: 'offline' };
  upload.mockResolvedValue({ error });
  jest
    .mocked(supabase!.rpc)
    .mockResolvedValueOnce({ data: row, error: null } as never)
    .mockResolvedValueOnce({
      data: null,
      error: { message: 'no object' },
    } as never);
  await expect(photoService.upload(user, draft)).rejects.toEqual(error);
});
test('completed retry skips re-uploading bytes', async () => {
  jest
    .mocked(supabase!.rpc)
    .mockResolvedValueOnce({
      data: { ...row, status: 'ready' },
      error: null,
    } as never);
  await photoService.upload(user, draft);
  expect(upload).not.toHaveBeenCalled();
});
test('blocks account switching between prepare and upload', async () => {
  jest
    .mocked(supabase!.auth.getSession)
    .mockResolvedValueOnce({
      data: { session: { user: { id: user } } },
      error: null,
    } as never)
    .mockResolvedValueOnce({
      data: { session: { user: { id: other } } },
      error: null,
    } as never);
  await expect(photoService.upload(user, draft)).rejects.toMatchObject({
    code: 'account_changed',
  });
  expect(upload).not.toHaveBeenCalled();
});
test('short-lived URLs require matching ownership; paths cannot escape the owner folder', async () => {
  await expect(photoService.signedUrl(user, row)).resolves.toContain(
    'https://',
  );
  expect(createSignedUrl).toHaveBeenCalledWith(row.storage_path, 300);
  await expect(photoService.signedUrl(other, row)).rejects.toThrow();
  expect(() =>
    ownedPhoto({ ...row, storage_path: user + '/../other.jpg' }, user),
  ).toThrow();
});
test('picker cancellation, denied permission and unavailable camera are distinct', async () => {
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({ didCancel: true });
  await expect(pickPhoto('library')).resolves.toBeNull();
  jest.mocked(launchCamera).mockResolvedValueOnce({ errorCode: 'permission' });
  await expect(pickPhoto('camera')).rejects.toBeInstanceOf(
    PhotoPermissionError,
  );
  jest
    .mocked(launchCamera)
    .mockResolvedValueOnce({ errorCode: 'camera_unavailable' });
  await expect(pickPhoto('camera')).rejects.toThrow('No camera');
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({ assets: [asset] });
  await expect(pickPhoto('library')).resolves.toMatchObject({
    contentType: 'image/jpeg',
  });
  expect(launchImageLibrary).toHaveBeenLastCalledWith(
    expect.objectContaining({
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.8,
      includeExtra: false,
    }),
  );
});
test('rejects unsupported/missing/oversized image content before upload', () => {
  expect(() => selectedPhoto(undefined)).toThrow();
  expect(() => selectedPhoto({ ...asset, base64: 'YWJjZA==' })).toThrow(
    'JPEG or PNG',
  );
  expect(() =>
    selectedPhoto({
      ...asset,
      base64: 'A'.repeat(Math.ceil(maxPhotoBytes / 3) * 4 + 4),
    }),
  ).toThrow('5 MB');
});
test('comparison requires two distinct same-category images and sorts chronologically', () => {
  const second = { ...row, id: other, recorded_at: '2021-01-01T12:00:00Z' };
  expect(comparison([second, row])?.[0].id).toBe(row.id);
  expect(comparison([row, row])).toBeNull();
  expect(comparison([row, { ...second, photo_type: 'side' }])).toBeNull();
});
