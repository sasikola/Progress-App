export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  switch (code) {
    case 'invalid_credentials':
      return 'The email or password is incorrect. Please try again.';
    case 'email_not_confirmed':
      return 'Confirm your email before signing in. Check your inbox and spam folder.';
    case 'weak_password':
      return 'Choose a stronger password. Your account may require a longer password or more character types.';
    case 'same_password':
      return 'Choose a password you haven’t used for this account.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Please wait a little before trying again.';
    case 'signup_disabled':
      return 'Account creation is temporarily unavailable. Please try again later.';
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'Your session has expired. Please sign in again.';
    default:
      return 'We couldn’t complete that request. Check your connection and try again.';
  }
}
