import { useId, useState, type ComponentPropsWithRef } from 'react';
import {
  TextInput as NativeTextInput,
  View,
  StyleSheet,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  type TextInputProps,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { AppText } from '../common/AppText';

type Props = TextInputProps & {
  label: string;
  error?: string;
  ref?: ComponentPropsWithRef<typeof NativeTextInput>['ref'];
};

export function TextInput({
  label,
  error,
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  ref,
  ...props
}: Props) {
  const [focused, setFocused] = useState(false);
  const accessoryId = useId();
  const numericAccessory =
    Platform.OS === 'ios' &&
    !props.inputAccessoryViewID &&
    ['numeric', 'decimal-pad', 'number-pad', 'phone-pad'].includes(
      props.keyboardType ?? '',
    );
  return (
    <View style={styles.container}>
      <AppText variant="label">{label}</AppText>
      <NativeTextInput
        ref={ref}
        {...props}
        inputAccessoryViewID={
          numericAccessory ? accessoryId : props.inputAccessoryViewID
        }
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={error ?? props.accessibilityHint}
        placeholderTextColor={colors.secondaryText}
        selectionColor={colors.accent}
        keyboardAppearance="dark"
        onFocus={event => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={event => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          focused && styles.focused,
          error ? styles.invalid : undefined,
          style,
        ]}
      />
      {numericAccessory && (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.accessory}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Done editing ${label}`}
              onPress={Keyboard.dismiss}
              style={styles.done}
            >
              <AppText variant="label" tone="accent">
                Done
              </AppText>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
      {error && (
        <AppText
          tone="error"
          variant="caption"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.secondarySurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 56,
    padding: spacing.lg,
  },
  focused: { borderColor: colors.accent },
  invalid: { borderColor: colors.error },
  accessory: {
    backgroundColor: colors.elevated,
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  done: {
    minHeight: 56,
    minWidth: 72,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
