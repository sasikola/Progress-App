import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Camera } from 'react-native-camera-kit';
import { Button } from '../src/components/buttons/Button';
import {
  BarcodeScannerView,
  ScanBarcodePanel,
} from '../src/screens/nutrition/BarcodeScanner';
import { nutritionService } from '../src/services/nutrition/nutritionService';
import type { Food } from '../src/services/nutrition/model';

jest.mock('../src/services/nutrition/nutritionService', () => ({
  nutritionService: { getFoodByBarcode: jest.fn() },
}));

const service = jest.mocked(nutritionService);
// Not part of the package's real type declarations — a test-only export
// added by the jest.setup.js mock so this permission flow is controllable.
const requestAuth: jest.Mock =
  require('react-native-camera-kit').__mockRequestDeviceCameraAuthorization;
let view: ReactTestRenderer.ReactTestRenderer;
let client: QueryClient;

const flush = async () => {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
};
const output = () =>
  JSON.stringify(view.toJSON(), (key, value) =>
    key === 'props' ? undefined : value,
  );

beforeEach(() => {
  jest.clearAllMocks();
  requestAuth.mockResolvedValue(true);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
});
afterEach(async () => {
  if (view) await act(async () => view.unmount());
  client.clear();
});

test('requests camera permission on mount and shows the scanning hint once granted', async () => {
  const onCancel = jest.fn();
  await act(async () => {
    view = ReactTestRenderer.create(
      <BarcodeScannerView onScan={jest.fn()} onCancel={onCancel} />,
    );
  });
  await flush();
  expect(requestAuth).toHaveBeenCalled();
  expect(output()).toContain('Point your camera at a barcode.');

  await act(async () => {
    view.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Cancel')!
      .props.onPress();
  });
  expect(onCancel).toHaveBeenCalled();
});

test('shows an Open Settings action when camera permission is denied', async () => {
  requestAuth.mockResolvedValue(false);
  const openSettings = jest
    .spyOn(Linking, 'openSettings')
    .mockResolvedValue();
  await act(async () => {
    view = ReactTestRenderer.create(
      <BarcodeScannerView onScan={jest.fn()} onCancel={jest.fn()} />,
    );
  });
  await flush();
  expect(output()).toContain('Camera access is denied');

  await act(async () => {
    view.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Open Settings')!
      .props.onPress();
  });
  expect(openSettings).toHaveBeenCalled();
});

test('ignores a non-numeric scanned code (e.g. a QR code) rather than looking it up', async () => {
  await act(async () => {
    view = ReactTestRenderer.create(
      <QueryClientProvider client={client}>
        <ScanBarcodePanel onFound={jest.fn()} onCancel={jest.fn()} />
      </QueryClientProvider>,
    );
  });
  await flush();
  await act(async () => {
    view.root.findByType(Camera).props.onReadCode({
      nativeEvent: { codeStringValue: 'https://example.com', codeFormat: 'qr' },
    });
  });
  await flush();
  expect(service.getFoodByBarcode).not.toHaveBeenCalled();
});

test('scanning a valid barcode looks it up and calls onFound', async () => {
  const apple: Food = {
    id: 'food-2', source: 'open_food_facts', sourceFoodId: '3017620422003',
    name: 'Apple sauce', brand: null, barcode: '3017620422003', servingSize: null,
    servingUnit: null, calories: 52, proteinG: 0.3, carbsG: 14, fatG: 0.2,
    fiberG: null, sugarG: null, sodiumMg: null,
  };
  service.getFoodByBarcode.mockResolvedValue(apple);
  const onFound = jest.fn();
  await act(async () => {
    view = ReactTestRenderer.create(
      <QueryClientProvider client={client}>
        <ScanBarcodePanel onFound={onFound} onCancel={jest.fn()} />
      </QueryClientProvider>,
    );
  });
  await flush();
  await act(async () => {
    view.root.findByType(Camera).props.onReadCode({
      nativeEvent: { codeStringValue: '3017620422003', codeFormat: 'ean-13' },
    });
  });
  await flush();
  expect(service.getFoodByBarcode).toHaveBeenCalledWith(
    '3017620422003',
    expect.anything(),
  );
  expect(onFound).toHaveBeenCalledWith(apple);
});

test('shows "no product found" for an unrecognized barcode, with a way to scan again', async () => {
  service.getFoodByBarcode.mockResolvedValue(null);
  await act(async () => {
    view = ReactTestRenderer.create(
      <QueryClientProvider client={client}>
        <ScanBarcodePanel onFound={jest.fn()} onCancel={jest.fn()} />
      </QueryClientProvider>,
    );
  });
  await flush();
  await act(async () => {
    view.root.findByType(Camera).props.onReadCode({
      nativeEvent: { codeStringValue: '00000000', codeFormat: 'ean-8' },
    });
  });
  await flush();
  expect(output()).toContain('No product found');

  await act(async () => {
    view.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Scan again')!
      .props.onPress();
  });
  await flush();
  expect(view.root.findAllByType(Camera)).toHaveLength(1);
});

test('shows a retryable error when the barcode lookup fails', async () => {
  service.getFoodByBarcode.mockRejectedValue(new Error('Provider is down.'));
  await act(async () => {
    view = ReactTestRenderer.create(
      <QueryClientProvider client={client}>
        <ScanBarcodePanel onFound={jest.fn()} onCancel={jest.fn()} />
      </QueryClientProvider>,
    );
  });
  await flush();
  await act(async () => {
    view.root.findByType(Camera).props.onReadCode({
      nativeEvent: { codeStringValue: '00000000', codeFormat: 'ean-8' },
    });
  });
  await flush();
  expect(output()).toContain('Provider is down.');

  service.getFoodByBarcode.mockResolvedValueOnce(null);
  await act(async () => {
    await view.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Try again')!
      .props.onPress();
  });
  await flush();
  expect(service.getFoodByBarcode).toHaveBeenCalledTimes(2);
});
