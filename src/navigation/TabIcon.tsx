import { StyleSheet, View } from 'react-native';
import type { MainTabParamList } from './types';

// A shared 24-point canvas and stroke keep these native icons consistent.
export function TabIcon({
  name,
  color,
}: {
  name: keyof MainTabParamList;
  color: string;
}) {
  const stroke = { borderColor: color };
  return (
    <View
      style={styles.canvas}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {name === 'Home' && (
        <>
          <View style={[styles.roof, stroke]} />
          <View style={[styles.house, stroke]} />
        </>
      )}
      {name === 'Workout' && (
        <>
          <View style={[styles.bar, { backgroundColor: color }]} />
          <View style={[styles.plate, styles.left, stroke]} />
          <View style={[styles.plate, styles.right, stroke]} />
        </>
      )}
      {name === 'Nutrition' && (
        <>
          <View style={[styles.appleBody, stroke]} />
          <View style={[styles.stem, { backgroundColor: color }]} />
        </>
      )}
      {name === 'Progress' && (
        <View style={styles.chart}>
          {[8, 14, 20].map(height => (
            <View
              key={height}
              style={[styles.column, { height, backgroundColor: color }]}
            />
          ))}
        </View>
      )}
      {name === 'You' && (
        <>
          <View style={[styles.head, stroke]} />
          <View style={[styles.shoulders, stroke]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: 24, height: 24 },
  roof: {
    position: 'absolute',
    width: 13,
    height: 13,
    top: 3,
    left: 5.5,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  house: {
    position: 'absolute',
    left: 5,
    top: 11,
    width: 14,
    height: 11,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  bar: { position: 'absolute', left: 2, top: 11, width: 20, height: 2 },
  plate: {
    position: 'absolute',
    top: 5,
    width: 5,
    height: 14,
    borderWidth: 2,
    borderRadius: 2,
  },
  left: { left: 3 },
  right: { right: 3 },
  appleBody: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderWidth: 2,
    borderRadius: 8,
    left: 4,
    top: 6,
  },
  stem: {
    position: 'absolute',
    width: 2,
    height: 5,
    left: 11,
    top: 2,
    borderRadius: 1,
  },
  chart: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  column: { width: 3, borderRadius: 1 },
  head: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderWidth: 2,
    borderRadius: 5,
    left: 7.5,
    top: 1,
  },
  shoulders: {
    position: 'absolute',
    width: 18,
    height: 10,
    borderWidth: 2,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    left: 3,
    bottom: 1,
  },
});
