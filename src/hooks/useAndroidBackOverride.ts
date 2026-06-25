import { BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";
import React from "react";

export default function useAndroidBackOverride(
  onBackPress: (() => boolean) | null | undefined,
) {
  useFocusEffect(
    React.useCallback(() => {
      if (!onBackPress) {
        return undefined;
      }

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );

      return () => {
        subscription.remove();
      };
    }, [onBackPress]),
  );
}
