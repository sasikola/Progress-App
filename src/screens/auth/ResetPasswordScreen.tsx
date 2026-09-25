import { useState } from 'react';
import { View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '../../components/inputs/FormField';
import { Button } from '../../components/buttons/Button';
import { authService } from '../../services/auth/authService';
import { useAuth } from '../../services/auth/AuthProvider';
import { authErrorMessage } from '../../services/auth/errors';
import {
  passwordSchema,
  type PasswordValues,
} from '../../services/auth/validation';
import { AuthLayout, authStyles, FormMessage } from './AuthLayout';

export function ResetPasswordScreen() {
  const { finishRecovery } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onTouched',
  });
  const submit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await authService.updatePassword(password);
      reset();
      setSaved(true);
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  });
  async function cancel() {
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
  if (saved)
    return (
      <AuthLayout
        title="Password updated."
        description="Your new password is ready to use."
      >
        <Button label="Continue" onPress={finishRecovery} />
      </AuthLayout>
    );
  return (
    <AuthLayout
      title="Choose a new password."
      description="Use at least 8 characters, and make it one you haven’t used before."
    >
      <View style={authStyles.form}>
        <FormField
          control={control}
          name="password"
          label="New password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!isSubmitting && !signingOut}
        />
        <FormField
          control={control}
          name="confirmPassword"
          label="Confirm new password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!isSubmitting && !signingOut}
        />
        <FormMessage message={error} />
        <Button
          label="Update password"
          loading={isSubmitting}
          disabled={signingOut}
          onPress={submit}
        />
        <Button
          label="Cancel and sign out"
          variant="secondary"
          loading={signingOut}
          disabled={isSubmitting}
          onPress={cancel}
        />
      </View>
    </AuthLayout>
  );
}
