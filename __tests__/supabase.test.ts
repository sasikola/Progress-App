test('missing configuration does not create a broken client', () => {
  const { supabase, environment } = require('../src/lib/supabase');
  expect(environment.status).toBe('missing');
  expect(supabase).toBeNull();
});

test('initializes the real SDK with configured values without a network request', () => {
  jest.isolateModules(() => {
    jest.doMock('react-native-config', () => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-public-key',
    }));
    const { supabase, environment } = require('../src/lib/supabase');
    expect(environment.status).toBe('ready');
    expect(supabase).not.toBeNull();
    expect(typeof supabase.from).toBe('function');
  });
});
beforeEach(() => {
  jest.resetModules();
  jest.doMock('react-native-config', () => ({}));
});
