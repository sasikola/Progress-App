import { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { OptionList } from '../../components/inputs/OptionList';
import { Button } from '../../components/buttons/Button';
import { goalOptions, type Goal } from '../../services/profile/validation';
import { useOnboarding } from './OnboardingProvider';
import { OnboardingLayout, onboardingStyles } from './OnboardingLayout';

export function GoalStepScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParamList, 'Goal'>) {
  const { draft, setGoal } = useOnboarding();
  const [selected, setSelected] = useState<Goal | null>(draft.goal);
  function submit() {
    if (!selected) return;
    setGoal(selected);
    navigation.navigate('Weight');
  }
  return (
    <OnboardingLayout
      step={2}
      totalSteps={4}
      title="What's your goal?"
      description="This helps us tailor your experience."
      onBack={navigation.goBack}
    >
      <View style={onboardingStyles.form}>
        <OptionList
          options={goalOptions}
          value={selected}
          onChange={setSelected}
          accessibilityLabel="Goal"
        />
        <Button label="Continue" disabled={!selected} onPress={submit} />
      </View>
    </OnboardingLayout>
  );
}
