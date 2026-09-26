import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, radii } from '../theme';
import Icon from './Icon';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeightPct?: number;
  /** Right-hand slot in the title row (e.g. a "Clear All" action). */
  headerRight?: ReactNode;
  /** Pinned footer below the scroll area (e.g. "Apply filters"). */
  footer?: ReactNode;
  /** Set false to hide the close chip (design hides it on handle-only sheets). */
  showClose?: boolean;
}

/**
 * Bottom sheet matching the prototype's `_sheetShell`: 22px top radius, a
 * 40x5 drag handle, an optional title row with a right-hand action, a
 * scrollable body capped at a % of the screen, and an optional pinned footer.
 * Enters with a slide-up + backdrop fade (the design's `rise .28s`).
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  children,
  maxHeightPct = 86,
  headerRight,
  footer,
  showClose = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : 180,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdropWrap, { opacity: anim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: `${maxHeightPct}%`, paddingBottom: Math.max(insets.bottom, 20) + 8, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {title ? (
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <View style={styles.headerActions}>
                {headerRight}
                {showClose ? (
                  <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                    <Icon name="x" size={17} color={colors.text} strokeWidth={2.4} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdropWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xxl + 2,
    borderTopRightRadius: radii.xxl + 2,
  },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 2 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontFamily: fontFamily.bold, fontSize: 19, color: colors.text },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md + 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 20, paddingBottom: 16 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
});
