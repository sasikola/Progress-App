import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SignInScreen } from '../src/screens/auth/SignInScreen';
import { TextInput } from '../src/components/inputs/TextInput';
import { Button } from '../src/components/buttons/Button';
import { FormMessage } from '../src/screens/auth/AuthLayout';
import { authService } from '../src/services/auth/authService';
import type { AuthStackParamList } from '../src/navigation/types';

jest.mock('../src/services/auth/AuthProvider', () => ({
  useAuth: () => ({ configured: true }),
}));
jest.mock('../src/services/auth/authService', () => ({
  authService: { signIn: jest.fn() },
}));

test('validates input, submits trimmed email, and shows busy/error states', async () => {
  const props = {
    navigation: { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
    route: { key: 'sign-in', name: 'SignIn' },
  } as unknown as NativeStackScreenProps<AuthStackParamList, 'SignIn'>;
  let view!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    view = ReactTestRenderer.create(
      <SafeAreaProvider>
        <SignInScreen {...props} />
      </SafeAreaProvider>,
    );
  });
  const submit = () =>
    view.root
      .findAllByType(Button)
      .find(item => item.props.label === 'Sign in')!;
  const input = (label: string) =>
    view.root
      .findAllByType(TextInput)
      .find(item => item.props.label === label)!;
  await act(async () => {
    await submit().props.onPress();
  });
  expect(authService.signIn).not.toHaveBeenCalled();
  expect(input('Email').props.error).toBeTruthy();
  expect(input('Password').props.error).toBeTruthy();
  await act(async () => {
    input('Email').props.onChangeText(' user@example.com ');
    input('Password').props.onChangeText('secret password');
  });
  let reject!: (error: unknown) => void;
  jest.mocked(authService.signIn).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  let submission!: Promise<void>;
  await act(async () => {
    submission = submit().props.onPress();
  });
  expect(authService.signIn).toHaveBeenCalledWith({
    email: 'user@example.com',
    password: 'secret password',
  });
  expect(submit().props.loading).toBe(true);
  expect(input('Email').props.editable).toBe(false);
  await act(async () => {
    reject({ code: 'invalid_credentials' });
    await submission;
  });
  expect(submit().props.loading).toBe(false);
  expect(view.root.findByType(FormMessage).props.message).toContain(
    'email or password is incorrect',
  );
  await act(async () => view.unmount());
});
