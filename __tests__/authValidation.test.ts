import {
  emailSchema,
  passwordSchema,
  signInSchema,
  signUpSchema,
} from '../src/services/auth/validation';
import { authErrorMessage } from '../src/services/auth/errors';
import { parseAuthLink } from '../src/services/auth/links';

test('trims email, preserves passwords, and permits legacy passwords on sign in', () => {
  expect(
    signInSchema.parse({ email: ' user@example.com ', password: ' x ' }),
  ).toEqual({ email: 'user@example.com', password: ' x ' });
});
test('rejects invalid email, weak new passwords, and mismatched confirmations', () => {
  expect(emailSchema.safeParse({ email: 'not-email' }).success).toBe(false);
  expect(
    signInSchema.safeParse({ email: 'user@example.com', password: '' }).success,
  ).toBe(false);
  expect(
    signUpSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
      confirmPassword: 'short',
    }).success,
  ).toBe(false);
  const mismatch = passwordSchema.safeParse({
    password: 'strong-password',
    confirmPassword: 'different',
  });
  expect(mismatch.success).toBe(false);
  if (!mismatch.success)
    expect(mismatch.error.issues[0].path).toEqual(['confirmPassword']);
});
test('accepts matching valid signup fields', () => {
  expect(
    signUpSchema.safeParse({
      email: 'user@example.com',
      password: 'strong-password',
      confirmPassword: 'strong-password',
    }).success,
  ).toBe(true);
});
test('maps auth errors without exposing internal details', () => {
  expect(
    authErrorMessage({
      code: 'invalid_credentials',
      message: 'private backend response',
    }),
  ).toContain('email or password');
  expect(authErrorMessage(new Error('private backend response'))).not.toContain(
    'private',
  );
});
test('parses only the exact owned auth endpoints', () => {
  expect(
    parseAuthLink(
      'https://evil.example/recovery#access_token=a&refresh_token=b',
    ),
  ).toEqual({ kind: 'ignored' });
  expect(
    parseAuthLink(
      'progress://auth.evil/recovery#access_token=a&refresh_token=b',
    ),
  ).toEqual({ kind: 'ignored' });
  expect(
    parseAuthLink('progress://auth/other#access_token=a&refresh_token=b'),
  ).toEqual({ kind: 'ignored' });
  expect(
    parseAuthLink('progress://auth/recovery#error_code=otp_expired'),
  ).toEqual({ kind: 'invalid' });
  expect(parseAuthLink('progress://auth/confirm#access_token=a')).toEqual({
    kind: 'invalid',
  });
  expect(
    parseAuthLink(
      'progress://auth/recovery#access_token=a&refresh_token=b&type=recovery',
    ),
  ).toEqual({
    kind: 'session',
    recovery: true,
    accessToken: 'a',
    refreshToken: 'b',
  });
});
