import { readEnvironment } from '../src/lib/environment';

test('missing or blank credentials leave the preview available', () => {
  expect(readEnvironment({})).toEqual({ status: 'missing' });
  expect(
    readEnvironment({ SUPABASE_URL: ' ', SUPABASE_ANON_KEY: ' ' }),
  ).toEqual({ status: 'missing' });
});

test.each([
  'not-a-url',
  'http://example.supabase.co',
  'https://name:password@example.supabase.co',
  'https://example.supabase.co?secret=value',
])('rejects an unsafe or malformed URL: %s', url => {
  expect(
    readEnvironment({
      SUPABASE_URL: url,
      SUPABASE_ANON_KEY: 'test-public-key',
    }),
  ).toEqual({ status: 'invalid' });
});

test('normalizes public client configuration', () => {
  expect(
    readEnvironment({
      SUPABASE_URL: ' https://example.supabase.co/ ',
      SUPABASE_ANON_KEY: ' test-public-key ',
    }),
  ).toEqual({
    status: 'ready',
    url: 'https://example.supabase.co',
    anonKey: 'test-public-key',
  });
});
