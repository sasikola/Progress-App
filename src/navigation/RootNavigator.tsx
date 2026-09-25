import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { navigationTheme } from '../theme';
import { MainTabNavigator } from './MainTabNavigator';
import { AuthNavigator } from './AuthNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { useAuth } from '../services/auth/AuthProvider';
import { useProfile } from '../services/profile/useProfile';
import { profileErrorMessage } from '../services/profile/errors';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { Screen } from '../components/common/Screen';
import { ErrorState, LoadingState } from '../components/feedback/States';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
export function RootNavigator() {
  const reduced = useReducedMotion();
  const { session, status, recovery, linkError, retry, dismissLinkError } =
    useAuth();
  const profileEnabled = Boolean(session?.user.id) && !recovery;
  const profileQuery = useProfile(
    profileEnabled ? session!.user.id : undefined,
  );
  if (status === 'loading')
    return (
      <Screen>
        <LoadingState label="Opening Progress…" />
      </Screen>
    );
  if (status === 'error')
    return (
      <Screen>
        <ErrorState
          title="We couldn’t restore your session"
          description="Check your connection and make sure your device is unlocked, then try again."
          action={{ label: 'Try again', onPress: retry }}
        />
      </Screen>
    );
  if (linkError)
    return (
      <Screen>
        <ErrorState
          title="This link couldn’t be opened"
          description={linkError}
          action={{ label: 'Continue', onPress: dismissLinkError }}
        />
      </Screen>
    );
  if (profileEnabled && profileQuery.isLoading)
    return (
      <Screen>
        <LoadingState label="Setting up your profile…" />
      </Screen>
    );
  if (profileEnabled && profileQuery.isError) {
    return (
      <Screen>
        <ErrorState
          title="We couldn’t load your profile"
          description={profileErrorMessage(profileQuery.error)}
          action={{ label: 'Try again', onPress: () => profileQuery.refetch() }}
        />
      </Screen>
    );
  }
  const needsOnboarding =
    profileEnabled &&
    (!profileQuery.data || !profileQuery.data.onboarding_completed);
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: reduced ? 'none' : 'fade_from_bottom',
        }}
      >
        {session ? (
          recovery ? (
            <Stack.Screen
              name="ResetPassword"
              component={ResetPasswordScreen}
            />
          ) : needsOnboarding ? (
            <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
          ) : (
            <Stack.Screen name="Main" component={MainTabNavigator} />
          )
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
