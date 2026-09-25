import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Screen } from '../../components/common/Screen';
import { AppText } from '../../components/common/AppText';
import { Button } from '../../components/buttons/Button';
import { useAuth } from '../../services/auth/AuthProvider';
import { colors, spacing } from '../../theme';

export function AuthLayout({
  title,
  description,
  children,
  onBack,
  busy = false,
}: PropsWithChildren<{
  title: string;
  description: string;
  onBack?: () => void;
  busy?: boolean;
}>) {
  const { configured } = useAuth();
  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={styles.header}>
          <AppText variant="eyebrow" tone="accent">
            PROGRESS
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          <AppText tone="secondary">{description}</AppText>
        </View>
        {!configured && (
          <AppText accessibilityRole="alert" tone="error">
            Account access isn’t available yet. Connection setup needs to be
            completed before you can continue.
          </AppText>
        )}
        {children}
        {onBack && (
          <Button
            label="Back"
            variant="secondary"
            onPress={onBack}
            disabled={busy}
          />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
export function FormMessage({
  message,
  success = false,
}: {
  message: string | null;
  success?: boolean;
}) {
  return message ? (
    <AppText
      accessibilityRole={success ? undefined : 'alert'}
      accessibilityLiveRegion="polite"
      tone={success ? 'secondary' : 'error'}
    >
      {message}
    </AppText>
  ) : null;
}
export const authStyles = StyleSheet.create({
  form: { gap: spacing.lg },
  actions: { gap: spacing.md },
});
const styles = StyleSheet.create({
  keyboard: { flex: 1, backgroundColor: colors.background },
  header: { gap: spacing.lg },
});
