import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, motion, radius, spacing } from '../../theme';
import { AppText } from '../common/AppText';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  accessibilityHint?: string;
  accessibilityLabel?: string;
  selected?: boolean;
};

export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  accessibilityHint,
  accessibilityLabel,
  selected,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      scale.stopAnimation();
      scale.setValue(1);
    }
    return () => scale.stopAnimation();
  }, [scale, reduced]);
  const unavailable = disabled || loading;
  const primary = variant === 'primary';
  const foreground = primary ? colors.onAccent : colors.text;
  function animate(toValue: number) {
    if (reduced) {
      scale.stopAnimation();
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, {
      toValue: reduced ? 1 : toValue,
      duration: motion.press,
      useNativeDriver: true,
    }).start();
  }
  return (
    <Animated.View
      style={[{ transform: [{ scale }] }, unavailable && styles.unavailable]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{
          disabled: unavailable,
          busy: loading,
          ...(selected === undefined ? {} : { selected }),
        }}
        disabled={unavailable}
        onPress={onPress}
        onPressIn={() => animate(motion.pressedScale)}
        onPressOut={() => animate(1)}
        style={[styles.button, primary ? styles.primary : styles.secondary]}
      >
        {loading && <ActivityIndicator color={foreground} accessible={false} />}
        <AppText variant="label" style={[styles.label, { color: foreground }]}>
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  label: { flexShrink: 1, textAlign: 'center' },
  unavailable: { opacity: 0.5 },
  button: {
    minHeight: 56,
    padding: spacing.lg,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.elevated },
});
