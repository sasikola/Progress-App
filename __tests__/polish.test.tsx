import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  AccessibilityInfo,
  Animated,
  Keyboard,
  ScrollView,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '../src/components/common/Screen';
import { TextInput } from '../src/components/inputs/TextInput';
import { Button } from '../src/components/buttons/Button';
import {
  ErrorState,
  LoadingState,
  EmptyState,
} from '../src/components/feedback/States';
import { Choices } from '../src/screens/progress/ProgressParts';
import { ProfileScreen } from '../src/screens/profile/ProfileScreen';

let mockProfile: Record<string, unknown>;
jest.mock('../src/services/profile/useProfile', () => ({
  useProfile: () => mockProfile,
}));
jest.mock('../src/services/auth/AuthProvider', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1', email: 'test@example.test' } },
  }),
}));
let view: ReactTestRenderer.ReactTestRenderer;
async function render(children: React.ReactNode) {
  await act(async () => {
    view = ReactTestRenderer.create(
      <SafeAreaProvider>{children}</SafeAreaProvider>,
    );
  });
}
beforeEach(() => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
});
afterEach(async () => {
  if (view) await act(async () => view.unmount());
  jest.restoreAllMocks();
});

test('scroll screens adjust for the keyboard and allow interactive dismissal', async () => {
  await render(
    <Screen>
      <TextInput label="Name" />
    </Screen>,
  );
  const props = view.root.findByType(ScrollView).props;
  expect(props.automaticallyAdjustKeyboardInsets).toBe(true);
  expect(props.keyboardDismissMode).toBe('interactive');
  expect(props.keyboardShouldPersistTaps).toBe('handled');
});
test('numeric fields have independently linked Done controls', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  await render(
    <>
      <TextInput label="Weight" keyboardType="decimal-pad" />
      <TextInput label="Reps" keyboardType="number-pad" />
    </>,
  );
  const inputs = view.root.findAll(node =>
    Boolean(node.props.inputAccessoryViewID),
  );
  const ids = new Set(inputs.map(input => input.props.inputAccessoryViewID));
  expect(ids.size).toBe(2);
  const done = view.root
    .findAllByProps({ accessibilityLabel: 'Done editing Weight' })
    .find(node => node.props.onPress)!;
  await act(async () => done.props.onPress());
  expect(dismiss).toHaveBeenCalledTimes(1);
});
test('error message is an alert while retry remains a separate accessible control', async () => {
  const retry = jest.fn();
  await render(
    <ErrorState
      description="Request failed"
      action={{ label: 'Retry', onPress: retry }}
    />,
  );
  expect(
    view.root.findAllByProps({ accessibilityRole: 'alert' }).length,
  ).toBeGreaterThan(0);
  await act(async () => view.root.findByType(Button).props.onPress());
  expect(retry).toHaveBeenCalledTimes(1);
});
test('single-select controls identify their group, selection and disabled state', async () => {
  await render(
    <Choices
      options={[
        { value: 'kg', label: 'kg' },
        { value: 'lb', label: 'lb' },
      ]}
      value="kg"
      onChange={jest.fn()}
      disabled
      accessibilityLabel="Weight units"
    />,
  );
  const options = view.root.findAllByProps({ accessibilityRole: 'radio' });
  expect(
    options.find(node => node.props.accessibilityLabel === 'kg')!.props
      .accessibilityState,
  ).toEqual({ selected: true, checked: true, disabled: true });
  expect(
    view.root.findAllByProps({ accessibilityLabel: 'Weight units' }).length,
  ).toBeGreaterThan(0);
});
test('Reduce Motion avoids press animation timers and exposes contextual labels', async () => {
  const timing = jest.spyOn(Animated, 'timing');
  await render(
    <Button
      label="Select"
      accessibilityLabel="Select front photo"
      selected
      onPress={jest.fn()}
    />,
  );
  timing.mockClear();
  const button = view.root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(node => node.props.onPressIn)!;
  await act(async () => {
    button.props.onPressIn();
    button.props.onPressOut();
  });
  expect(timing).not.toHaveBeenCalled();
  expect(button.props.accessibilityLabel).toBe('Select front photo');
  expect(button.props.accessibilityState.selected).toBe(true);
});
test('profile loading is not shown as an empty profile', async () => {
  mockProfile = { isLoading: true };
  await render(<ProfileScreen />);
  expect(view.root.findAllByType(LoadingState)).toHaveLength(1);
  expect(view.root.findAllByType(EmptyState)).toHaveLength(0);
});
test('profile failures expose a retry rather than an empty state', async () => {
  const refetch = jest.fn();
  mockProfile = { isError: true, error: { code: '42703' }, refetch };
  await render(<ProfileScreen />);
  expect(view.root.findAllByType(EmptyState)).toHaveLength(0);
  const error = view.root.findByType(ErrorState);
  expect(error.props.description).toContain('migration');
  await act(async () => error.props.action.onPress());
  expect(refetch).toHaveBeenCalled();
});
