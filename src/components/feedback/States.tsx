import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { AppText } from '../common/AppText';
import { Button } from '../buttons/Button';

type Props = {
  title: string;
  description: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <View style={styles.container}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="secondary">{description}</AppText>
      {action && <Button {...action} variant="secondary" />}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
}: Omit<Props, 'title'> & { title?: string }) {
  return (
    <View style={styles.container}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      <AppText
        tone="secondary"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        {description}
      </AppText>
      {action && <Button {...action} variant="secondary" />}
    </View>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <View
      style={styles.loading}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator color={colors.accent} accessible={false} />
      <AppText tone="secondary" style={styles.loadingLabel}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  loadingLabel: { flexShrink: 1 },
  loading: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
});
