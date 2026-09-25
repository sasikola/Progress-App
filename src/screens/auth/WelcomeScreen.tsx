import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { Button } from '../../components/buttons/Button';
import { AppText } from '../../components/common/AppText';
import { AuthLayout, authStyles } from './AuthLayout';

export function WelcomeScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, 'Welcome'>) {
  return (
    <AuthLayout
      title={'A little stronger.\nEvery day.'}
      description="Train. Track. Progress. One place for your workouts and the progress you earn."
    >
      <View style={authStyles.actions}>
        <Button
          label="Create account"
          onPress={() => navigation.navigate('SignUp')}
        />
        <Button
          label="Sign in"
          variant="secondary"
          onPress={() => navigation.navigate('SignIn')}
        />
      </View>
      <AppText tone="secondary" variant="caption">
        Your training journey starts with you.
      </AppText>
    </AuthLayout>
  );
}
