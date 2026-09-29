import React, { ReactNode } from 'react';
import { KeyboardAvoidingView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
  background?: string;
  /**
   * Lift content above the on-screen keyboard. On by default so every screen
   * gets it — each screen with a TextInput renders through this container.
   *
   * targetSdk 36 makes the manifest's `adjustResize` a no-op: edge-to-edge is
   * enforced from Android 15, so the window no longer shrinks when the IME
   * opens and inputs end up behind the keyboard. `behavior="padding"` derives
   * the inset from JS keyboard events instead, which is correct on every API
   * level — where `adjustResize` still resizes (Android < 15) and on iOS, the
   * measured overlap is already 0, so no extra padding is applied.
   */
  keyboardAvoiding?: boolean;
  /** Extra offset when a fixed header sits above the avoided area. */
  keyboardVerticalOffset?: number;
}

export default function ScreenContainer({
  children,
  edges = ['top'],
  style,
  background = '#FFFFFF',
  keyboardAvoiding = true,
  keyboardVerticalOffset = 0,
}: Props) {
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: background }, style]}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding"
          keyboardVerticalOffset={keyboardVerticalOffset}
        >
          {children}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
