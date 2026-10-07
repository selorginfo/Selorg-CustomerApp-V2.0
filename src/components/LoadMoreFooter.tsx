import React from 'react';
import { StyleSheet, View } from 'react-native';
import PrimaryButton from './PrimaryButton';

interface Props {
  hasMore: boolean;
  loading: boolean;
  onPress: () => void;
  testID?: string;
}

/** "Load more" button shown under a paged list while the server has more rows. */
export default function LoadMoreFooter({ hasMore, loading, onPress, testID }: Props) {
  if (!hasMore) return null;
  return (
    <View style={styles.wrap}>
      <PrimaryButton
        label={loading ? 'Loading…' : 'Load more'}
        kind="ghost"
        onPress={onPress}
        loading={loading}
        disabled={loading}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 8 },
});
