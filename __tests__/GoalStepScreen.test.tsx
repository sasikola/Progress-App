import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GoalStepScreen } from '../src/screens/onboarding/GoalStepScreen';
import { OptionList } from '../src/components/inputs/OptionList';
import { Button } from '../src/components/buttons/Button';
import type { OnboardingStackParamList } from '../src/navigation/types';

const mockSetGoal = jest.fn();
jest.mock('../src/screens/onboarding/OnboardingProvider', () => ({
  useOnboarding: () => ({ draft: { goal: null }, setGoal: mockSetGoal }),
}));

test('disables Continue until a goal is chosen, then advances to the weight step', async () => {
  const navigate = jest.fn();
  const goBack = jest.fn();
  const props = {
    navigation: { navigate, goBack },
    route: { key: 'goal', name: 'Goal' },
  } as unknown as NativeStackScreenProps<OnboardingStackParamList, 'Goal'>;
  let view!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    view = ReactTestRenderer.create(
      <SafeAreaProvider>
        <GoalStepScreen {...props} />
      </SafeAreaProvider>,
    );
  });
  const submit = () =>
    view.root
      .findAllByType(Button)
      .find(item => item.props.label === 'Continue')!;
  expect(submit().props.disabled).toBe(true);
  await act(async () => {
    view.root.findByType(OptionList).props.onChange('lose_fat');
  });
  expect(submit().props.disabled).toBe(false);
  await act(async () => {
    await submit().props.onPress();
  });
  expect(mockSetGoal).toHaveBeenCalledWith('lose_fat');
  expect(navigate).toHaveBeenCalledWith('Weight');
  await act(async () => {
    view.root
      .findAllByType(Button)
      .find(item => item.props.label === 'Back')!
      .props.onPress();
  });
  expect(goBack).toHaveBeenCalled();
  await act(async () => view.unmount());
});
