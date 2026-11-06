import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

/**
 * Full-width banner that keeps the artwork's own shape.
 * Cover was clipping the copy on the right of wide creatives in the category column.
 */
export function ResponsiveBanner({
  uri,
  testID,
}: {
  uri: string;
  testID?: string;
}) {
  const [ratio, setRatio] = useState(16 / 9);

  useEffect(() => {
    let alive = true;
    if (typeof Image.getSize !== 'function') return undefined;
    Image.getSize(
      uri,
      (width, height) => {
        if (alive && width > 0 && height > 0) setRatio(width / height);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [uri]);

  return (
    <View style={[styles.frame, { aspectRatio: ratio }]} testID={testID}>
      <Image source={{ uri }} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', backgroundColor: '#eef4e6' },
  image: { width: '100%', height: '100%' },
});
