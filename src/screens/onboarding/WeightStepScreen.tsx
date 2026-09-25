import { View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { FormField } from '../../components/inputs/FormField';
import { SegmentedControl } from '../../components/inputs/SegmentedControl';
import { Button } from '../../components/buttons/Button';
import {
  weightStepSchema,
  weightUnitOptions,
  type WeightStepValues,
} from '../../services/profile/validation';
import { useOnboarding } from './OnboardingProvider';
import { OnboardingLayout, onboardingStyles } from './OnboardingLayout';

export function WeightStepScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParamList, 'Weight'>) {
  const { draft, setWeight } = useOnboarding();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<WeightStepValues>({
    resolver: zodResolver(weightStepSchema),
    defaultValues: { weightValue: draft.weightValue, unit: draft.weightUnit },
    mode: 'onTouched',
  });
  const submit = handleSubmit(values => {
    setWeight(values.weightValue.trim(), values.unit);
    navigation.navigate('Complete');
  });
  function skip() {
    setWeight('', draft.weightUnit);
    navigation.navigate('Complete');
  }
  return (
    <OnboardingLayout
      step={3}
      totalSteps={4}
      title="Current weight (optional)"
      description="Track your starting point. You can skip this and add it later."
      onBack={navigation.goBack}
    >
      <View style={onboardingStyles.form}>
        <FormField
          control={control}
          name="weightValue"
          label="Weight"
          keyboardType="decimal-pad"
          editable={!isSubmitting}
        />
        <Controller
          control={control}
          name="unit"
          render={({ field }) => (
            <SegmentedControl
              options={weightUnitOptions}
              value={field.value}
              onChange={field.onChange}
              accessibilityLabel="Weight unit"
            />
          )}
        />
        <View style={onboardingStyles.actions}>
          <Button label="Continue" onPress={submit} />
          <Button label="Skip" variant="secondary" onPress={skip} />
        </View>
      </View>
    </OnboardingLayout>
  );
}
