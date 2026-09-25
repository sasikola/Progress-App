import { Text, type TextProps } from 'react-native';
import { colors, typography } from '../../theme';

type Props = TextProps & {
  variant?: keyof typeof typography;
  tone?: 'primary' | 'secondary' | 'accent' | 'error';
};

const tones = {
  primary: colors.text,
  secondary: colors.secondaryText,
  accent: colors.accent,
  error: colors.error,
};

export function AppText({
  variant = 'body',
  tone = 'primary',
  style,
  ...props
}: Props) {
  return (
    <Text
      {...props}
      style={[typography[variant], { color: tones[tone] }, style]}
    />
  );
}
