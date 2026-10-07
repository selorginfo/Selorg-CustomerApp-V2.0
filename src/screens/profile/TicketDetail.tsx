import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Header, Icon, ScreenContainer } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { useSupport } from '../../context/SupportContext';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TicketDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'TicketDetail'>>();
  const { tickets, sendMessage, reopenTicket, refreshTicket } = useSupport();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const ticketId = route.params.ticketId;

  const ticket = tickets.find(t => t.id === ticketId);

  // Agent replies arrive without the customer having to send something first:
  // fetch on open and poll while the conversation is on screen.
  useFocusEffect(
    useCallback(() => {
      refreshTicket(ticketId);
      const t = setInterval(() => refreshTicket(ticketId), 10000);
      return () => clearInterval(t);
    }, [ticketId, refreshTicket]),
  );

  if (!ticket) {
    return (
      <ScreenContainer>
        <Header title="Conversation" onBack={() => navigation.goBack()} />
        <View style={styles.notFoundWrap}>
          <Text style={styles.notFoundTitle}>This ticket is no longer available.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const resolved = ticket.status === 'resolved';

  const onSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    const ok = await sendMessage(ticket.id, text);
    // Put an undelivered message back in the composer for a retry.
    if (!ok) setDraft(prev => prev || text);
  };

  return (
    <ScreenContainer>
      <Header
        title={ticket.subject}
        subtitle={resolved ? 'Resolved' : 'Support · online'}
        onBack={() => navigation.goBack()}
      />
      <View style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.msgList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {ticket.messages.map((m, i) => {
            const mine = m.from === 'you';
            return (
              <View key={i} style={[styles.bubbleWrap, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                    { borderBottomRightRadius: mine ? 4 : radii.xl, borderBottomLeftRadius: mine ? radii.xl : 4 },
                  ]}
                >
                  <Text style={[styles.bubbleText, { color: mine ? colors.white : colors.text }]}>{m.text}</Text>
                </View>
                <Text style={[styles.bubbleTime, { textAlign: mine ? 'right' : 'left' }]}>
                  {new Date(m.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {resolved ? (
          <View style={styles.reopenWrap}>
            <Pressable onPress={() => reopenTicket(ticket.id)} style={styles.reopenBtn}>
              <Text style={styles.reopenLabel}>Reopen ticket</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message…"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              onSubmitEditing={onSend}
              returnKeyType="send"
            />
            <Pressable onPress={onSend} style={styles.sendBtn}>
              <Icon name="send" size={18} color={colors.white} />
            </Pressable>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  notFoundWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  notFoundTitle: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  msgList: { padding: spacing.md, gap: 10 },
  bubbleWrap: { maxWidth: '80%' },
  bubble: { borderRadius: radii.xl, paddingVertical: 11, paddingHorizontal: 14 },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleTheirs: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontFamily: fontFamily.medium, fontSize: 13.5, lineHeight: 19 },
  bubbleTime: { fontFamily: fontFamily.medium, fontSize: 10.5, color: colors.textMuted, marginTop: 3 },
  reopenWrap: { padding: spacing.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.borderLight },
  reopenBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  reopenLabel: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.primary },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.text,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
