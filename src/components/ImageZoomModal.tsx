import React from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import Icon from './Icon';

interface Props {
  visible: boolean;
  uri: string;
  onClose: () => void;
}

/** Full-screen product image viewer (the design's `pdpZoom` overlay). */
export default function ImageZoomModal({ visible, uri, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
          <Icon name="x" size={20} color={colors.white} />
        </Pressable>
        {uri ? <Image source={{ uri }} style={styles.image} resizeMode="contain" /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,12,8,0.92)', padding: 16 },
  closeBtn: {
    position: 'absolute',
    top: 44,
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '88%', height: '70%' },
});
