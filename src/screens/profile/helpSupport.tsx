import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, Icon, ScreenContainer, StateView } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { useSupport } from '../../context/SupportContext';
import type { Ticket } from '../../context/SupportContext';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Quick-help prompts from the design — each opens a new support ticket. */
const FAQS = [
  'Where is my order?',
  'How do refunds work?',
  'Change delivery address',
  'Report a missing item',
];

export default function HelpSupportScreen() {
  const navigation = useNavigation<Nav>();
  const { tickets, newTicket } = useSupport();

  const onNewConversation = async () => {
    const t = await newTicket();
    navigation.navigate('TicketDetail', { ticketId: t.id });
  };

  return (
    <ScreenContainer>
      <Header title="Help & support" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={onNewConversation} style={styles.ctaCard}>
          <View style={styles.ctaIconTile}>
            <Icon name="chat" size={24} color={colors.white} />
          </View>
          <View style={styles.ctaTextWrap}>
            <Text style={styles.ctaTitle}>New conversation</Text>
            <Text style={styles.ctaSub}>Avg. reply in 2 min</Text>
          </View>
          <Icon name="chevronRight" size={20} color={colors.white} />
        </Pressable>

        <Text style={styles.sectionLabel}>QUICK HELP</Text>
        <View style={styles.faqCard}>
          {FAQS.map((f, i) => (
            <Pressable
              key={f}
              onPress={onNewConversation}
              style={[styles.faqRow, i === FAQS.length - 1 && styles.faqRowLast]}
            >
              <Text style={styles.faqLabel}>{f}</Text>
              <Icon name="chevronRight" size={16} color={colors.textMuted} strokeWidth={2.4} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>YOUR CONVERSATIONS</Text>
        {tickets.length === 0 ? (
          <StateView
            kind="empty"
            title="No tickets yet"
            message="Need help? Start a conversation and we’ll get back to you."
            icon="chat"
            ctaLabel="Start conversation"
            onCta={onNewConversation}
          />
        ) : (
          tickets.map((t: Ticket) => {
            const lastMsg = t.messages[t.messages.length - 1];
            const open = t.status === 'open';
            return (
              <Pressable
                key={t.id}
                onPress={() => navigation.navigate('TicketDetail', { ticketId: t.id })}
                style={styles.ticketRow}
              >
                <View style={styles.ticketTextWrap}>
                  <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                  {lastMsg ? <Text style={styles.ticketPreview} numberOfLines={1}>{lastMsg.text}</Text> : null}
                  <Text style={styles.ticketDate}>
                    {new Date(t.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: open ? colors.tint : colors.background }]}>
                  <Text style={[styles.statusLabel, { color: open ? colors.primary : colors.textMuted }]}>
                    {open ? 'Open' : 'Resolved'}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  faqCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  faqRowLast: { borderBottomWidth: 0 },
  faqLabel: { flex: 1, minWidth: 0, fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.text,
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: spacing.lg - 4,
  },
  ctaIconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTextWrap: { flex: 1 },
  ctaTitle: { fontFamily: fontFamily.bold, fontSize: 14.5, color: colors.white },
  ctaSub: { fontFamily: fontFamily.medium, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  sectionLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textMuted, marginBottom: 10 },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg + 2,
    padding: 14,
    marginBottom: 10,
  },
  ticketTextWrap: { flex: 1, minWidth: 0 },
  ticketSubject: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: colors.text },
  ticketPreview: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  ticketDate: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.textMuted, marginTop: 4 },
  statusPill: { borderRadius: 7, paddingVertical: 4, paddingHorizontal: 9 },
  statusLabel: { fontFamily: fontFamily.bold, fontSize: 10.5 },
});
