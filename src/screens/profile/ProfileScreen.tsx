import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../../components/common/Screen';
import { AppText } from '../../components/common/AppText';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/feedback/States';
import { profileErrorMessage } from '../../services/profile/errors';
import { useAuth } from '../../services/auth/AuthProvider';
import { authService } from '../../services/auth/authService';
import { authErrorMessage } from '../../services/auth/errors';
import { useProfile } from '../../services/profile/useProfile';
import { goalOptions } from '../../services/profile/validation';
import { Button } from '../../components/buttons/Button';
import { FormMessage } from '../auth/AuthLayout';
import { colors, radius, spacing } from '../../theme';

export function ProfileScreen() {
  const { session } = useAuth();
  const profileQuery = useProfile(session?.user.id);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signOut() {
    setSigningOut(true);
    setError(null);
    try {
      await authService.signOut();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="eyebrow" tone="accent">
          YOUR OWN PACE
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          You
        </AppText>
      </View>
      {profileQuery.isLoading ? (
        <LoadingState label="Loading your profile…" />
      ) : profileQuery.isError ? (
        <ErrorState
          title="Couldn’t refresh your profile"
          description={profileErrorMessage(profileQuery.error)}
          action={{
            label: 'Retry profile',
            onPress: () => profileQuery.refetch(),
          }}
        />
      ) : profileQuery.data ? (
        <View style={styles.panel}>
          <AppText variant="label">Name</AppText>
          <AppText tone="secondary">{profileQuery.data.name}</AppText>
          <AppText variant="label">Goal</AppText>
          <AppText tone="secondary">
            {goalOptions.find(
              option => option.value === profileQuery.data!.goal,
            )?.label ??
              profileQuery.data.goal ??
              'No goal selected'}
          </AppText>
          <AppText variant="label">Weight unit</AppText>
          <AppText tone="secondary">{profileQuery.data.weight_unit}</AppText>
        </View>
      ) : (
        <EmptyState
          title="Your journey, your way."
          description="Your profile details will appear here."
        />
      )}
      <View style={styles.panel}>
        <AppText variant="label">Signed in</AppText>
        <AppText variant="caption" tone="secondary">
          {session?.user.email}
        </AppText>
      </View>
      <FormMessage message={error} />
      <Button
        label="Sign out"
        variant="secondary"
        loading={signingOut}
        onPress={signOut}
      />
      <AppText variant="caption" tone="secondary">
        Train. Track. Progress.
      </AppText>
    </Screen>
  );
}
const styles = StyleSheet.create({
  header: { gap: spacing.md },
  panel: {
    backgroundColor: colors.secondarySurface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
});
