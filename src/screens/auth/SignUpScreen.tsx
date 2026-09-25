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
import {
  signUpSchema,
  type SignUpValues,
} from '../../services/auth/validation';
import { AuthLayout, authStyles, FormMessage } from './AuthLayout';

export function SignUpScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, 'SignUp'>) {
  const { configured } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
    mode: 'onTouched',
  });
  const submit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      const result = await authService.signUp({ email, password });
      if (result.confirmationRequired) {
        reset();
        setSent(true);
      }
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  });
  if (sent)
    return (
      <AuthLayout
        title="Check your inbox."
        description="If your address is eligible, you’ll receive an email to confirm your account. Check your spam folder too."
      >
        <Button
          label="Back to sign in"
          onPress={() => navigation.replace('SignIn')}
        />
      </AuthLayout>
    );
  return (
    <AuthLayout
      title="Make it your own."
      description="Create your account and start your journey. Use a password with at least 8 characters."
      onBack={navigation.goBack}
      busy={isSubmitting}
    >
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
        <FormField
          control={control}
          name="password"
          label="Password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!isSubmitting}
        />
        <FormField
          control={control}
          name="confirmPassword"
          label="Confirm password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!isSubmitting}
        />
        <FormMessage message={error} />
        <Button
          label="Create account"
          loading={isSubmitting}
          disabled={!configured}
          onPress={submit}
        />
        <Button
          label="Already have an account? Sign in"
          variant="secondary"
          disabled={isSubmitting}
          onPress={() => navigation.replace('SignIn')}
        />
      </View>
    </AuthLayout>
  );
}
