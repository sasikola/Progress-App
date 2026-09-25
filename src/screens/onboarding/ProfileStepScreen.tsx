import { View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { FormField } from '../../components/inputs/FormField';
import { Button } from '../../components/buttons/Button';
import {
  profileStepSchema,
  type ProfileStepValues,
} from '../../services/profile/validation';
import { useOnboarding } from './OnboardingProvider';
import { OnboardingLayout, onboardingStyles } from './OnboardingLayout';

export function ProfileStepScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParamList, 'Profile'>) {
  const { draft, setName } = useOnboarding();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ProfileStepValues>({
    resolver: zodResolver(profileStepSchema),
    defaultValues: { name: draft.name },
    mode: 'onTouched',
  });
  const submit = handleSubmit(values => {
    setName(values.name);
    navigation.navigate('Goal');
  });
  return (
    <OnboardingLayout
      step={1}
      totalSteps={4}
      title="Let's set up your profile."
      description="What should we call you?"
    >
      <View style={onboardingStyles.form}>
        <FormField
          control={control}
          name="name"
          label="Name"
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          editable={!isSubmitting}
          onSubmitEditing={() => submit()}
        />
        <Button label="Continue" onPress={submit} />
      </View>
    </OnboardingLayout>
  );
}
