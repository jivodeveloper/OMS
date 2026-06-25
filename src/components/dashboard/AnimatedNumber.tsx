import React, { useEffect, useRef } from 'react';
import { Animated, TextStyle } from 'react-native';
import { Text } from 'react-native-paper';

interface Props {
  value: string;
  style?: TextStyle;
}

export default function AnimatedNumber({ value, style }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(10);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [value]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Text style={style}>{value}</Text>
    </Animated.View>
  );
}
