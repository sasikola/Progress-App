import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStepScreen } from '../src/screens/onboarding/ProfileStepScreen';
import { TextInput } from '../src/components/inputs/TextInput';
import { Button } from '../src/components/buttons/Button';
import type { OnboardingStackParamList } from '../src/navigation/types';

const mockSetName = jest.fn();
jest.mock('../src/screens/onboarding/OnboardingProvider', () => ({
  useOnboarding: () => ({ draft: { name: '' }, setName: mockSetName }),
}));

test('requires a name before continuing, then advances to the goal step', async () => {
  const navigate = jest.fn();
  const props = {
    navigation: { navigate, goBack: jest.fn() },
    route: { key: 'profile', name: 'Profile' },
  } as unknown as NativeStackScreenProps<OnboardingStackParamList, 'Profile'>;
  let view!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    view = ReactTestRenderer.create(
      <SafeAreaProvider>
        <ProfileStepScreen {...props} />
      </SafeAreaProvider>,
    );
  });
  const submit = () =>
    view.root
      .findAllByType(Button)
      .find(item => item.props.label === 'Continue')!;
  await act(async () => {
    await submit().props.onPress();
  });
  expect(mockSetName).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
  expect(
    view.root
      .findAllByType(TextInput)
      .find(item => item.props.label === 'Name')!.props.error,
  ).toBeTruthy();
  await act(async () => {
    view.root
      .findAllByType(TextInput)
      .find(item => item.props.label === 'Name')!
      .props.onChangeText('Alex');
  });
  await act(async () => {
    await submit().props.onPress();
  });
  expect(mockSetName).toHaveBeenCalledWith('Alex');
  expect(navigate).toHaveBeenCalledWith('Goal');
  await act(async () => view.unmount());
});
