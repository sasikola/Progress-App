import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhotosPanel } from '../src/screens/progress/PhotosPanel';
import { Button } from '../src/components/buttons/Button';
import { photoService } from '../src/services/photos/photoService';
import {
  pickPhoto,
  PhotoPermissionError,
} from '../src/services/photos/photoPicker';
jest.mock('../src/services/photos/photoService', () => ({
  photoService: {
    timeline: jest.fn(),
    upload: jest.fn(),
    signedUrl: jest.fn(),
  },
}));
jest.mock('../src/services/photos/photoPicker', () => ({
  pickPhoto: jest.fn(),
  PhotoPermissionError: class extends Error {},
}));
jest.mock('../src/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));
const user = '00000000-0000-4000-8000-000000000001';
const photo = {
  id: '00000000-0000-4000-8000-000000000003',
  user_id: user,
  client_id: 'photo-one',
  photo_type: 'front' as const,
  storage_path: user + '/one.jpg',
  recorded_at: '2020-01-01T12:00:00Z',
  status: 'ready' as const,
};
const service = jest.mocked(photoService);
let view: ReactTestRenderer.ReactTestRenderer;
let client: QueryClient;
const flush = async () => {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
};
const output = () =>
  JSON.stringify(view.toJSON(), (key, value) =>
    key === 'props' ? undefined : value,
  );
async function render() {
  await act(async () => {
    view = ReactTestRenderer.create(
      <QueryClientProvider client={client}>
        <PhotosPanel userId={user} />
      </QueryClientProvider>,
    );
  });
  await flush();
}
async function press(label: string, index = 0) {
  await act(async () => {
    await view.root
      .findAllByType(Button)
      .filter(button => button.props.label === label)
      [index].props.onPress();
  });
  await flush();
}
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  service.timeline.mockResolvedValue({ entries: [], next: null });
  service.signedUrl.mockResolvedValue('https://example.test/private');
  service.upload.mockResolvedValue(photo);
  jest.mocked(pickPhoto).mockResolvedValue({
    uri: 'file:///selected.jpg',
    base64: '/9j/AA==',
    contentType: 'image/jpeg',
    byteSize: 4,
  });
});
afterEach(async () => {
  if (view) await act(async () => view.unmount());
  client.clear();
});
test('requires preview and explicit upload; retries keep frozen request', async () => {
  await render();
  await press('Choose from library');
  expect(service.upload).not.toHaveBeenCalled();
  service.upload.mockRejectedValueOnce(new Error('offline'));
  await press('Upload privately');
  const request = service.upload.mock.calls[0];
  expect(output()).toContain('Retry upload');
  await press('Retry upload');
  expect(service.upload.mock.calls[1]).toEqual(request);
  expect(output()).toContain('Photo saved privately.');
});
test('permission errors offer Settings while cancellation does not show failure', async () => {
  jest.mocked(pickPhoto).mockResolvedValueOnce(null);
  await render();
  await press('Choose from library');
  expect(output()).not.toContain('Upload privately');
  jest
    .mocked(pickPhoto)
    .mockRejectedValueOnce(new PhotoPermissionError('Allow photo access.'));
  await press('Take photo');
  expect(output()).toContain('Open Settings');
});
test('selects two photos into a side-by-side chronological comparison', async () => {
  service.timeline.mockResolvedValue({
    entries: [
      {
        ...photo,
        id: '00000000-0000-4000-8000-000000000004',
        recorded_at: '2021-01-01T12:00:00Z',
      },
      photo,
    ],
    next: null,
  });
  await render();
  await press('Select for comparison');
  await press('Select for comparison');
  expect(output()).toContain('Before / After');
  expect(service.signedUrl).toHaveBeenCalledWith(
    user,
    expect.objectContaining({ user_id: user }),
  );
  await press('Clear comparison');
  expect(output()).not.toContain('Before / After');
});
test('timeline setup failures are visible, not presented as no photos', async () => {
  service.timeline.mockRejectedValue({ code: '42703' });
  await render();
  expect(output()).toContain('Phase 6 SQL migration');
  expect(output()).not.toContain('Your photo journey starts here');
});

test('older pages replace mounted images and newer navigation restores the page', async () => {
  const older = {
    ...photo,
    id: '00000000-0000-4000-8000-000000000009',
    recorded_at: '2019-01-01T12:00:00Z',
  };
  service.timeline.mockImplementation(async (_user, _type, cursor) =>
    cursor
      ? { entries: [older], next: null }
      : { entries: [photo], next: photo },
  );
  await render();
  await press('Older photos');
  expect(service.timeline).toHaveBeenLastCalledWith(
    user,
    'all',
    photo,
    expect.anything(),
  );
  expect(
    view.root
      .findAllByType(Button)
      .filter(button => button.props.label === 'Select for comparison'),
  ).toHaveLength(1);
  expect(output()).toContain('2019');
  expect(output()).not.toContain('2020');
  await press('Newer photos');
  expect(output()).toContain('2020');
  expect(output()).not.toContain('2019');
});

test('inactive photo panel does not request timeline or signed links', async () => {
  await act(async () => {
    view = ReactTestRenderer.create(
      <QueryClientProvider client={client}>
        <PhotosPanel userId={user} active={false} />
      </QueryClientProvider>,
    );
  });
  await flush();
  expect(service.timeline).not.toHaveBeenCalled();
  expect(service.signedUrl).not.toHaveBeenCalled();
});
