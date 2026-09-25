import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { AppText } from '../../components/common/AppText';
import { Button } from '../../components/buttons/Button';
import { FormMessage } from '../auth/AuthLayout';
import { goalOptions } from '../../services/profile/validation';
import { useOnboarding } from './OnboardingProvider';
import { OnboardingLayout, onboardingStyles } from './OnboardingLayout';

export function CompleteStepScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParamList, 'Complete'>) {
  const { draft, submit, isSubmitting, error } = useOnboarding();
  const goalLabel = goalOptions.find(
    option => option.value === draft.goal,
  )?.label;
  return (
    <OnboardingLayout
      step={4}
      totalSteps={4}
      title="You're all set."
      description="Review your details, then get started."
      onBack={navigation.goBack}
      busy={isSubmitting}
    >
      <View style={onboardingStyles.form}>
        <View>
          <AppText variant="label">Name</AppText>
          <AppText tone="secondary">{draft.name}</AppText>
        </View>
        <View>
          <AppText variant="label">Goal</AppText>
          <AppText tone="secondary">{goalLabel}</AppText>
        </View>
        {draft.weightValue !== '' && (
          <View>
            <AppText variant="label">Weight</AppText>
            <AppText tone="secondary">
              {draft.weightValue} {draft.weightUnit}
            </AppText>
          </View>
        )}
        <FormMessage message={error} />
        <Button label="Get started" loading={isSubmitting} onPress={submit} />
      </View>
    </OnboardingLayout>
  );
}
