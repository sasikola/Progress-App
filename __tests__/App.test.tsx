/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import App from '../App';
import { Button } from '../src/components/buttons/Button';
import { SignInScreen } from '../src/screens/auth/SignInScreen';
import { SignUpScreen } from '../src/screens/auth/SignUpScreen';
import { ForgotPasswordScreen } from '../src/screens/auth/ForgotPasswordScreen';

test('opens auth without credentials and navigates between account screens', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  let app!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    app = ReactTestRenderer.create(<App />);
  });
  function press(label: string) {
    app.root
      .findAllByType(Button)
      .find(button => button.props.label === label)!
      .props.onPress();
  }
  await ReactTestRenderer.act(async () => {
    press('Sign in');
  });
  expect(app.root.findAllByType(SignInScreen)).toHaveLength(1);
  expect(
    app.root
      .findByType(SignInScreen)
      .findAllByType(Button)
      .find(button => button.props.label === 'Sign in')!.props.disabled,
  ).toBe(true);
  await ReactTestRenderer.act(async () => press('Forgot password?'));
  expect(app.root.findAllByType(ForgotPasswordScreen)).toHaveLength(1);
  await ReactTestRenderer.act(async () =>
    app.root.findByType(ForgotPasswordScreen).props.navigation.goBack(),
  );
  await ReactTestRenderer.act(async () => press('Create an account'));
  expect(app.root.findAllByType(SignUpScreen)).toHaveLength(1);
  await ReactTestRenderer.act(async () => app.unmount());
  jest.restoreAllMocks();
});
