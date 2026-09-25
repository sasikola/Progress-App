import { Suspense, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CameraType, type CameraApi } from 'react-native-camera-kit';
import { AppText } from '../../components/common/AppText';
import { Button } from '../../components/buttons/Button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/feedback/States';
import { barcodePattern, type Food } from '../../services/nutrition/model';
import { useLookupBarcode } from '../../services/nutrition/useNutrition';
import { colors, radius, spacing } from '../../theme';

type PermissionState = 'checking' | 'granted' | 'denied';
// Not re-exported from the package's public entry point (only CameraProps
// has it internally), so it's declared locally against the documented
// onReadCode event shape.
type ReadCodeEvent = {
  nativeEvent: { codeStringValue: string; codeFormat: string };
};

// react-native-camera-kit intentionally removed its own permission-prompt
// API (see the package README): the recommended pattern is a dedicated
// permissions library. Adding one here would undercut the whole reason
// camera-kit was chosen over vision-camera (zero extra native
// dependencies), so this uses the still-present (if soft-deprecated)
// CameraApi methods instead. If a future major version removes them, this
// is the one place that needs to change.
function useCameraPermission() {
  const cameraRef = useRef<CameraApi>(null);
  const [permission, setPermission] = useState<PermissionState>('checking');
  useEffect(() => {
    let active = true;
    cameraRef.current
      ?.requestDeviceCameraAuthorization()
      .then(granted => {
        if (active) setPermission(granted ? 'granted' : 'denied');
      })
      .catch(() => {
        if (active) setPermission('denied');
      });
    return () => {
      active = false;
    };
  }, []);
  return { cameraRef, permission };
}

export function BarcodeScannerView({
  onScan,
  onCancel,
}: {
  onScan: (barcode: string) => void;
  onCancel: () => void;
}) {
  const { cameraRef, permission } = useCameraPermission();
  const scannedRef = useRef(false);

  function handleReadCode(event: ReadCodeEvent) {
    if (scannedRef.current) return;
    const value = event.nativeEvent.codeStringValue.trim();
    // Ignore QR codes and other non-numeric formats: a packaged grocery
    // product is always EAN-8/UPC-A/EAN-13/GTIN-14, matching the same
    // pattern the manual-entry field already validates against.
    if (!barcodePattern.test(value)) return;
    scannedRef.current = true;
    onScan(value);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Suspense fallback={<LoadingState label="Starting camera…" />}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          cameraType={CameraType.Back}
          scanBarcode
          onReadCode={handleReadCode}
          showFrame
          laserColor={colors.accent}
          frameColor={colors.accent}
        />
      </Suspense>
      <View style={styles.overlay}>
        {permission === 'checking' && (
          <LoadingState label="Requesting camera access…" />
        )}
        {permission === 'denied' && (
          <View style={styles.panel}>
            <AppText tone="secondary">
              Camera access is denied. Allow access in Settings, then try
              again.
            </AppText>
            <Button
              label="Open Settings"
              variant="secondary"
              onPress={() => {
                Linking.openSettings().catch(() => {});
              }}
            />
          </View>
        )}
        {permission === 'granted' && (
          <View style={styles.panel}>
            <AppText tone="secondary" style={styles.hint}>
              Point your camera at a barcode.
            </AppText>
          </View>
        )}
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </SafeAreaView>
  );
}

export function ScanBarcodePanel({
  onFound,
  onCancel,
}: {
  onFound: (food: Food) => void;
  onCancel: () => void;
}) {
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const lookup = useLookupBarcode();

  async function handleScan(code: string) {
    setScannedCode(code);
    try {
      const food = await lookup.mutateAsync(code);
      if (food) onFound(food);
    } catch {
      // Surfaced via lookup.isError/.error below.
    }
  }
  function scanAgain() {
    setScannedCode(null);
    lookup.reset();
  }

  if (!scannedCode) {
    return <BarcodeScannerView onScan={handleScan} onCancel={onCancel} />;
  }
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.resultPanel}>
        {lookup.isPending && <LoadingState label="Looking up barcode…" />}
        {lookup.isError && (
          <ErrorState
            description={
              lookup.error instanceof Error
                ? lookup.error.message
                : "We couldn't look up that barcode. Try again."
            }
            action={{ label: 'Try again', onPress: () => handleScan(scannedCode) }}
          />
        )}
        {!lookup.isPending && !lookup.isError && lookup.data === null && (
          <EmptyState
            title="No product found"
            description="This barcode isn't in Open Food Facts yet. Try searching by name instead."
          />
        )}
        <Button label="Scan again" variant="secondary" onPress={scanAgain} />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  panel: {
    gap: spacing.md,
    backgroundColor: colors.secondarySurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  hint: { textAlign: 'center' },
  resultPanel: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
});
