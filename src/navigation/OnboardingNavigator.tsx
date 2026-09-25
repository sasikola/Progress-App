import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStepScreen } from '../screens/onboarding/ProfileStepScreen';
import { GoalStepScreen } from '../screens/onboarding/GoalStepScreen';
import { WeightStepScreen } from '../screens/onboarding/WeightStepScreen';
import { CompleteStepScreen } from '../screens/onboarding/CompleteStepScreen';
import { OnboardingProvider } from '../screens/onboarding/OnboardingProvider';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { OnboardingStackParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();
export function OnboardingNavigator() {
  const reduced = useReducedMotion();
  return (
    <OnboardingProvider>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: reduced ? 'none' : 'slide_from_right',
        }}
      >
        <Stack.Screen name="Profile" component={ProfileStepScreen} />
        <Stack.Screen name="Goal" component={GoalStepScreen} />
        <Stack.Screen name="Weight" component={WeightStepScreen} />
        <Stack.Screen name="Complete" component={CompleteStepScreen} />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}
