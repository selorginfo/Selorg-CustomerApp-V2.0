import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Header, ScreenContainer, Skeleton } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { legalApi } from '../../services/legal.service';
import { richTextToBlocks, type TextBlock } from '../../utils/richText';
import { getErrorCode, getErrorMessage } from '../../utils/apiError';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** HTML / Markdown from the CMS rendered as readable paragraphs and headings. */
function paragraphsFromContent(content?: string): TextBlock[] {
  return richTextToBlocks(content);
}

const note = (text: string): TextBlock => ({ text });

function extractContent(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  const d = doc as Record<string, unknown>;
  for (const key of ['content', 'body', 'html', 'text', 'markdown']) {
    if (typeof d[key] === 'string' && (d[key] as string).trim()) {
      return d[key] as string;
    }
  }
  return '';
}

export default function PolicyScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Legal'>>();
  const isTerms = route.params.type === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy';

  const [paragraphs, setParagraphs] = useState<TextBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErrorDetail(null);
    const req = isTerms ? legalApi.getTerms() : legalApi.getPrivacy();
    req
      .then(doc => {
        const content = extractContent(doc);
        const parts = paragraphsFromContent(content);
        if (parts.length) {
          setParagraphs(parts);
          return;
        }
        // Document exists but has no body yet (or unexpected shape).
        setParagraphs([
          note(`${title} content is not available yet.`),
          note('Please check back later, or contact Selorg support if you need a copy.'),
        ]);
      })
      .catch((err: unknown) => {
        const code = getErrorCode(err);
        const status = (err as { status?: number })?.status;
        // Backend has the route but no published document seeded → empty state, not a hard crash.
        if (code === 'NOT_FOUND' || status === 404) {
          setParagraphs([
            note(`${title} content is not available yet.`),
            note('Our legal documents are being published. Please try again later.'),
          ]);
          setErrorDetail(null);
          return;
        }
        setErrorDetail(getErrorMessage(err, 'Network or server error'));
        setParagraphs([note(`${title} could not be loaded. Please try again later.`)]);
      })
      .finally(() => setLoading(false));
  }, [isTerms, title]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScreenContainer>
      <Header title={title} onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.loader} testID="legal-loading">
          <Skeleton height={22} width="55%" radius={8} style={{ marginBottom: 16 }} />
          <Skeleton height={12} radius={6} style={{ marginBottom: 10 }} />
          <Skeleton height={12} radius={6} style={{ marginBottom: 10 }} />
          <Skeleton height={12} width="92%" radius={6} style={{ marginBottom: 10 }} />
          <Skeleton height={12} width="80%" radius={6} style={{ marginBottom: 18 }} />
          <Skeleton height={12} radius={6} style={{ marginBottom: 10 }} />
          <Skeleton height={12} width="88%" radius={6} style={{ marginBottom: 10 }} />
          <Skeleton height={12} width="70%" radius={6} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          testID="legal-content"
        >
          <View style={styles.card}>
            <Text style={styles.heading}>{title}</Text>
            {paragraphs.map((p, i) => (
              <Text key={i} style={p.heading ? styles.subheading : styles.paragraph}>
                {p.text}
              </Text>
            ))}
            {errorDetail ? (
              <View style={styles.retryBox}>
                <Text style={styles.errorDetail}>{errorDetail}</Text>
                <Pressable onPress={load} testID="legal-retry" accessibilityRole="button">
                  <Text style={styles.retry}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {/* Both documents stay one tap apart. */}
          <Pressable
            onPress={() => navigation.replace('Legal', { type: isTerms ? 'privacy' : 'terms' })}
            style={styles.otherDoc}
            accessibilityRole="link"
            testID="legal-other-doc"
          >
            <Text style={styles.retry}>{isTerms ? 'Read our Privacy Policy' : 'Read our Terms of Service'}</Text>
          </Pressable>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  subheading: { fontFamily: fontFamily.bold, fontSize: 14.5, color: colors.text, marginTop: 6, marginBottom: 8 },
  otherDoc: { alignItems: 'center', paddingVertical: 16 },
  loader: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: 32 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.md,
  },
  paragraph: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: spacing.sm + 4,
  },
  retryBox: { marginTop: spacing.md, gap: 8 },
  errorDetail: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textMuted },
  retry: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.primary },
});
