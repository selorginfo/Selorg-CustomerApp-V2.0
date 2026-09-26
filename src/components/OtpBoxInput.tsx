import React, { useEffect, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { colors, fontFamily, radii } from '../theme';

interface Props {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  autoFocus?: boolean;
}

/**
 * Visual OTP cells + a single real TextInput.
 * One input (not four) avoids flaky multi-EditText automation and reliably
 * accepts digit "0" via paste/autofill/`adb input text`.
 */
export default function OtpBoxInput({ length = 4, value, onChange, error, autoFocus }: Props) {
  const inputRef = useRef<TextInput | null>(null);
  const [focused, setFocused] = useState(false);
  const digits = Array.from({ length }, (_, i) => (value[i] != null && value[i] !== undefined ? value[i] : ''));
  const activeIndex = Math.min(value.length, length - 1);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [autoFocus]);

  const applyRaw = (raw: string) => {
    const clean = String(raw || '').replace(/[^0-9]/g, '').slice(0, length);
    onChange(clean);
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key !== 'Backspace') return;
    if (value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <View style={styles.wrap} testID="otp-input-wrap">
      <View style={styles.row} pointerEvents="box-none">
        {digits.map((d, i) => {
          const active = focused && i === activeIndex;
          return (
            <View
              key={i}
              testID={`otp-digit-${i}`}
              accessibilityLabel={`OTP digit ${i + 1}`}
              style={[
                styles.cell,
                {
                  borderColor: error
                    ? colors.danger
                    : d || active
                    ? colors.primary
                    : colors.border,
                  backgroundColor: colors.white,
                },
              ]}
            >
              <Text style={styles.digit}>{d}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        testID="otp-input"
        accessibilityLabel="OTP input"
        value={value}
        onChangeText={applyRaw}
        onKeyPress={onKeyPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        importantForAutofill="yes"
        maxLength={length}
        caretHidden
        autoFocus={autoFocus}
        style={styles.hiddenInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 9, justifyContent: 'center' },
  cell: {
    width: 52,
    height: 60,
    borderWidth: 1.5,
    borderRadius: radii.xl - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.text,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  // Covers the cell row so taps/paste land on one input.
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    color: 'transparent',
    fontSize: 1,
    padding: 0,
  },
});
