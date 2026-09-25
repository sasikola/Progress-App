import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Screen } from '../../components/common/Screen';
import { AppText } from '../../components/common/AppText';
import { Button } from '../../components/buttons/Button';
import { colors, spacing } from '../../theme';

export function OnboardingLayout({
  step,
  totalSteps,
  title,
  description,
  children,
  onBack,
  busy = false,
}: PropsWithChildren<{
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  onBack?: () => void;
  busy?: boolean;
}>) {
  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={styles.header}>
          <AppText variant="eyebrow" tone="accent">
            STEP {step} OF {totalSteps}
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          <AppText tone="secondary">{description}</AppText>
        </View>
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
export const onboardingStyles = StyleSheet.create({
  form: { gap: spacing.lg },
  actions: { gap: spacing.md },
});
const styles = StyleSheet.create({
  keyboard: { flex: 1, backgroundColor: colors.background },
  header: { gap: spacing.lg },
});
