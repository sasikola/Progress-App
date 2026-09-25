import React from 'react';
import { AccessibilityInfo } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Button } from '../src/components/buttons/Button';

test('a submitting button blocks interaction and exposes its busy state', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  let view!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    view = ReactTestRenderer.create(
      <Button label="Save" loading onPress={jest.fn()} />,
    );
  });
  const button = view.root.findAllByProps({ accessibilityRole: 'button' })[0];
  expect(button.props.accessibilityLabel).toBe('Save');
  expect(button.props.accessibilityState).toEqual({
    disabled: true,
    busy: true,
  });
  await ReactTestRenderer.act(async () => view.unmount());
  jest.restoreAllMocks();
});
