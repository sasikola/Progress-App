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
  signInSchema,
  type SignInValues,
} from '../../services/auth/validation';
import { AuthLayout, authStyles, FormMessage } from './AuthLayout';

export function SignInScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, 'SignIn'>) {
  const { configured } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });
  const submit = handleSubmit(async values => {
    setError(null);
    try {
      await authService.signIn(values);
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  });
  return (
    <AuthLayout
      title="Welcome back."
      description="Pick up where you left off."
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
          autoComplete="current-password"
          textContentType="password"
          editable={!isSubmitting}
          onSubmitEditing={() => {
            if (!isSubmitting && configured) submit();
          }}
        />
        <FormMessage message={error} />
        <Button
          label="Sign in"
          loading={isSubmitting}
          disabled={!configured}
          onPress={submit}
        />
        <Button
          label="Forgot password?"
          variant="secondary"
          disabled={isSubmitting}
          onPress={() => navigation.navigate('ForgotPassword')}
        />
        <Button
          label="Create an account"
          variant="secondary"
          disabled={isSubmitting}
          onPress={() => navigation.replace('SignUp')}
        />
      </View>
    </AuthLayout>
  );
}
