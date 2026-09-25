import { useState } from 'react';
import { View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { FormField } from '../../components/inputs/FormField';
import { Button } from '../../components/buttons/Button';
import { authService } from '../../services/auth/authService';
import { useAuth } from '../../services/auth/AuthProvider';
import { authErrorMessage } from '../../services/auth/errors';
import { emailSchema, type EmailValues } from '../../services/auth/validation';
import { AuthLayout, authStyles, FormMessage } from './AuthLayout';

export function ForgotPasswordScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>) {
  const { configured } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
    mode: 'onTouched',
  });
  const submit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await authService.requestPasswordReset(email);
      setSent(true);
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  });
  return (
    <AuthLayout
      title={sent ? 'Check your inbox.' : 'A fresh start.'}
      description={
        sent
          ? 'If an account exists for that email, you’ll receive a password-reset link. Open it on your phone to choose a new password.'
          : 'Enter your email and we’ll send you a link to reset your password.'
      }
      onBack={navigation.goBack}
      busy={isSubmitting}
    >
      {!sent && (
        <View style={authStyles.form}>
          <FormField
            control={control}
            name="email"
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            editable={!isSubmitting}
          />
          <FormMessage message={error} />
          <Button
            label="Send reset link"
            loading={isSubmitting}
            disabled={!configured}
            onPress={submit}
          />
        </View>
      )}
    </AuthLayout>
  );
}
