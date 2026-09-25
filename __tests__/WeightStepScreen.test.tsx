import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WeightStepScreen } from '../src/screens/onboarding/WeightStepScreen';
import { TextInput } from '../src/components/inputs/TextInput';
import { Button } from '../src/components/buttons/Button';
import type { OnboardingStackParamList } from '../src/navigation/types';

const mockSetWeight = jest.fn();
jest.mock('../src/screens/onboarding/OnboardingProvider', () => ({
  useOnboarding: () => ({
    draft: { weightValue: '', weightUnit: 'kg' },
    setWeight: mockSetWeight,
  }),
}));

beforeEach(() => jest.clearAllMocks());

test('Skip advances without requiring a value', async () => {
  const navigate = jest.fn();
  const props = {
    navigation: { navigate, goBack: jest.fn() },
    route: { key: 'weight', name: 'Weight' },
  } as unknown as NativeStackScreenProps<OnboardingStackParamList, 'Weight'>;
  let view!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    view = ReactTestRenderer.create(
      <SafeAreaProvider>
        <WeightStepScreen {...props} />
      </SafeAreaProvider>,
    );
  });
  await act(async () => {
    view.root
      .findAllByType(Button)
      .find(item => item.props.label === 'Skip')!
      .props.onPress();
  });
  expect(mockSetWeight).toHaveBeenCalledWith('', 'kg');
  expect(navigate).toHaveBeenCalledWith('Complete');
  await act(async () => view.unmount());
});

test('Continue rejects an invalid weight and accepts a valid one', async () => {
  const navigate = jest.fn();
  const props = {
    navigation: { navigate, goBack: jest.fn() },
    route: { key: 'weight', name: 'Weight' },
  } as unknown as NativeStackScreenProps<OnboardingStackParamList, 'Weight'>;
  let view!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    view = ReactTestRenderer.create(
      <SafeAreaProvider>
        <WeightStepScreen {...props} />
      </SafeAreaProvider>,
    );
  });
  const weightInput = () =>
    view.root
      .findAllByType(TextInput)
      .find(item => item.props.label === 'Weight')!;
  const submit = () =>
    view.root
      .findAllByType(Button)
      .find(item => item.props.label === 'Continue')!;
  await act(async () => weightInput().props.onChangeText('abc'));
  await act(async () => {
    await submit().props.onPress();
  });
  expect(mockSetWeight).not.toHaveBeenCalled();
  expect(weightInput().props.error).toBeTruthy();
  await act(async () => weightInput().props.onChangeText('70.5'));
  await act(async () => {
    await submit().props.onPress();
  });
  expect(mockSetWeight).toHaveBeenCalledWith('70.5', 'kg');
  expect(navigate).toHaveBeenCalledWith('Complete');
  await act(async () => view.unmount());
});
