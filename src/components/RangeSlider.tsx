import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const THUMB = 22;
const TRACK_H = 4;

interface Props {
  min: number;
  max: number;
  step?: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
}

/**
 * Dual-thumb range slider — the RN equivalent of the two stacked
 * `<input type="range">` elements in the design's filter sheet. Built on
 * PanResponder so it adds no dependency and works identically on both
 * platforms. Width is measured with onLayout, so it is fully responsive.
 */
export default function RangeSlider({ min, max, step = 50, low, high, onChange }: Props) {
  const [trackW, setTrackW] = useState(0);
  const usable = Math.max(trackW - THUMB, 1);

  const toPx = useCallback(
    (v: number) => ((Math.min(Math.max(v, min), max) - min) / (max - min)) * usable,
    [min, max, usable],
  );
  const toVal = useCallback(
    (px: number) => {
      const raw = min + (Math.min(Math.max(px, 0), usable) / usable) * (max - min);
      return Math.round(raw / step) * step;
    },
    [min, max, step, usable],
  );

  // Latest values live in a ref so the pan handlers (created once) stay correct.
  const vals = useRef({ low, high });
  vals.current = { low, high };
  const startPx = useRef(0);

  const makeResponder = useCallback(
    (which: 'low' | 'high') =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startPx.current = toPx(which === 'low' ? vals.current.low : vals.current.high);
        },
        onPanResponderMove: (_e, g) => {
          const next = toVal(startPx.current + g.dx);
          if (which === 'low') {
            onChange(Math.min(next, vals.current.high - step), vals.current.high);
          } else {
            onChange(vals.current.low, Math.max(next, vals.current.low + step));
          }
        },
      }),
    [onChange, step, toPx, toVal],
  );

  const lowPan = useMemo(() => makeResponder('low'), [makeResponder]);
  const highPan = useMemo(() => makeResponder('high'), [makeResponder]);

  const lowX = toPx(low);
  const highX = toPx(high);

  return (
    <View style={styles.wrap} onLayout={e => setTrackW(e.nativeEvent.layout.width)}>
      <View style={styles.track} />
      <View style={[styles.fill, { left: lowX + THUMB / 2, width: Math.max(highX - lowX, 0) }]} />
      <View {...lowPan.panHandlers} style={[styles.thumb, { left: lowX }]} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} />
      <View {...highPan.panHandlers} style={[styles.thumb, { left: highX }]} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 34, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: colors.border,
  },
  fill: { position: 'absolute', height: TRACK_H, borderRadius: TRACK_H / 2, backgroundColor: colors.primary },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.primary,
    shadowColor: '#14231A',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
