/* eslint-env jest */
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn().mockResolvedValue(false),
  setGenericPassword: jest
    .fn()
    .mockResolvedValue({ service: 'test', storage: 'test' }),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
  STORAGE_TYPE: { AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth' },
  ACCESSIBLE: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
  },
}));
jest.mock('react-native-config', () => ({}));
jest.mock('react-native-camera-kit', () => {
  const React = require('react');
  const { View } = require('react-native');
  // Shared (not per-render) so a test can reconfigure it via the exported
  // __mockRequestDeviceCameraAuthorization to simulate granted/denied.
  const requestDeviceCameraAuthorization = jest.fn().mockResolvedValue(true);
  // The real Camera is React.lazy-loaded (platform-split .ios/.android
  // files); tests don't need that indirection, so this mock is a plain
  // forwardRef component that never suspends.
  const Camera = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      capture: jest.fn(),
      requestDeviceCameraAuthorization,
      checkDeviceCameraAuthorizationStatus: jest.fn().mockResolvedValue(true),
    }));
    return React.createElement(View, props);
  });
  return {
    Camera,
    CameraType: { Front: 'front', Back: 'back' },
    __mockRequestDeviceCameraAuthorization: requestDeviceCameraAuthorization,
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
