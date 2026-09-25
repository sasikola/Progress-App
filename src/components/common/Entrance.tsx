import { useEffect, useRef, type PropsWithChildren } from 'react';
import { Animated } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { motion } from '../../theme';

export function Entrance({ children }: PropsWithChildren) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.enter,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [motion.distance, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
