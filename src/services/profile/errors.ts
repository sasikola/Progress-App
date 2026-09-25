export function profileErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  switch (code) {
    case '42703':
    case '42P01':
    case 'PGRST202':
    case 'PGRST204':
    case 'PGRST205':
      return 'The profile database setup is incomplete. Apply the profile compatibility migration, then try again.';
    case '23505':
      return 'Your profile already exists. Please try again.';
    case '42501':
      return 'You don’t have permission to save this. Please sign in again.';
    case 'PGRST116':
      return 'We couldn’t find your profile. Please try again.';
    default:
      return 'We couldn’t access your profile. Check your connection and try again.';
  }
}
