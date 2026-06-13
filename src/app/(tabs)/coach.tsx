import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePurchases } from '@/context/purchases';
import { useUser } from '@/context/user';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

const FEATURES = [
  '💬 Chat any time, day or night',
  '🧠 Evidence-based coping strategies',
  '📈 Personalised to your recovery journey',
  '🔒 Completely private and confidential',
];

const STARTERS = [
  "I need to talk to someone",
  "I almost placed a bet today",
  "The urge is really strong right now",
  "I had a slip",
  "I feel ashamed",
  "I can't stop thinking about betting",
  "I'm scared I'll relapse",
  "I don't know how to stop",
  "I owe a lot of money",
  "I'm hiding this from my family",
  "I'm proud of my progress today",
  "I made it through a tough day",
  "I need a distraction right now",
  "My partner doesn't know",
  "I lost my savings",
  "I keep going back to it",
  "I feel hopeless today",
  "I've been clean for a while",
  "I want to talk but feel judged",
  "Betting ads are everywhere",
  "There's a big game on and I'm tempted",
  "I'm stressed and want to escape",
  "I'm bored and tempted",
  "I just need someone to listen",
  "I feel like I'm the only one",
  "I want to celebrate a milestone",
  "I'm worried about money",
  "I'm having a hard week",
  "I just want to vent",
  "I almost gave in",
  "I need help staying focused today",
  "I feel angry and want to bet",
  "I've been lying to people",
  "I feel like I'm failing",
  "I'm doing better than expected",
  "I need a pep talk",
  "I'm not sure I can do this",
  "I relapsed and feel terrible",
  "I want to understand my triggers",
  "I need a plan for today",
  "I'm scared to tell my family",
  "I feel proud but also fragile",
  "Just want to check in",
  "I'm anxious and want to escape",
  "I lost more than I can afford",
  "I blocked the apps but still tempted",
  "I've been good all week",
  "I don't recognise myself anymore",
  "I want to quit but it's hard",
  "I need someone in my corner",
];

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
};

const GREETING: ChatMessage = {
  id: 'greeting',
  role: 'assistant',
  content:
    "Hi! I'm your AI Corner — here to support you through your recovery. Whether you're dealing with an urge, want to celebrate progress, or just need to talk, I've got you. How are you doing today?",
};

export default function CoachScreen() {
  const { isPremium, isLoadingPurchases, showPaywall } = usePurchases();
  const { isAdmin } = useUser();
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const hasAccess = isPremium || isAdmin;

  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const listRef = useRef<FlatList>(null);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 80);
  }, []);

  const sendText = useCallback(async (text: string) => {
    if (!text || isStreaming) return;

    // Build the API message history before mutating state
    const apiMessages = messages
      .filter(m => m.id !== 'greeting' && !m.pending && m.content.trim())
      .map(({ role, content }) => ({ role, content }));
    apiMessages.push({ role: 'user' as const, content: text });

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    const assistantId = `a-${Date.now() + 1}`;
    const placeholder: ChatMessage = { id: assistantId, role: 'assistant', content: '', pending: true };

    setInput('');
    setMessages(prev => [...prev, userMsg, placeholder]);
    setIsStreaming(true);
    scrollToBottom();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${FUNCTIONS_URL}/ai-coach`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (response.status === 429) {
        setRemaining(0);
        throw new Error('limit_reached');
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error((errBody as any).error ?? 'Request failed');
      }

      const rem = parseInt(response.headers.get('x-messages-remaining') ?? '-1', 10);
      if (rem >= 0) setRemaining(rem);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            if (
              event.type === 'content_block_delta' &&
              event.delta?.type === 'text_delta' &&
              event.delta.text
            ) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.delta.text, pending: false }
                    : m,
                ),
              );
              scrollToBottom(false);
            }
          } catch {
            // ignore malformed SSE events
          }
        }
      }
    } catch (err: any) {
      const isLimit = err?.message === 'limit_reached';
      console.error('ai-coach fetch error:', err);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: isLimit
                  ? "You've reached your 30 message daily limit. It resets at midnight. I'll be here when it does. 💙"
                  : "I'm having trouble connecting right now. Please try again in a moment.",
                pending: false,
              }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
      // Clear pending flag if the stream ended before any text arrived
      setMessages(prev =>
        prev.map(m => (m.id === assistantId && m.pending ? { ...m, pending: false } : m)),
      );
      scrollToBottom();
    }
  }, [isStreaming, messages, scrollToBottom]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (text) sendText(text);
  }, [input, sendText]);

  const sendStarter = useCallback((text: string) => {
    sendText(text);
  }, [sendText]);

  const showStarters = messages.length === 1;

  const [randomStarters, setRandomStarters] = useState<string[]>(() =>
    [...STARTERS].sort(() => Math.random() - 0.5).slice(0, 5),
  );

  useFocusEffect(
    useCallback(() => {
      setRandomStarters([...STARTERS].sort(() => Math.random() - 0.5).slice(0, 5));
    }, []),
  );

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isUser = item.role === 'user';
      return (
        <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowAssistant]}>
          {!isUser && (
            <View style={s.avatarCircle}>
              <Text style={s.avatarEmoji}>🤖</Text>
            </View>
          )}
          <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAssistant]}>
            {item.pending && !item.content ? (
              <View style={s.typingDots}>
                <ActivityIndicator size="small" color={c.primary} />
              </View>
            ) : (
              <Text style={[s.bubbleText, isUser ? s.bubbleTextUser : s.bubbleTextAssistant]}>
                {item.content}
              </Text>
            )}
          </View>
        </View>
      );
    },
    [s, c],
  );

  const header = (
    <LinearGradient
      colors={[c.headerGradDeep, c.headerGradStart, c.headerGradEnd]}
      style={s.header}
    >
      <SafeAreaView edges={['top']}>
        <View style={s.headerContent}>
          <Text style={s.headerTitle}>AI Corner</Text>
          {hasAccess && (
            <View style={s.premiumBadge}>
              <Text style={s.premiumBadgeTxt}>{isAdmin ? '👑 Admin' : '✨ Premium'}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );

  if (isLoadingPurchases) {
    return (
      <View style={s.root}>
        {header}
        <View style={s.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={s.root}>
        {header}
        <ScrollView contentContainerStyle={s.body}>
          <View style={s.lockCard}>
            <Text style={s.lockEmoji}>🤖</Text>
            <Text style={s.lockTitle}>AI Corner</Text>
            <Text style={s.lockDesc}>
              Your personal AI support — available 24/7 and built for gambling recovery.{'\n'}
              Exclusive to Premium.
            </Text>
            <View style={s.featureList}>
              {FEATURES.map(f => (
                <View key={f} style={s.featureRow}>
                  <Text style={s.featureItem}>{f}</Text>
                </View>
              ))}
            </View>
            <Pressable
              style={({ pressed }) => [s.upgradeBtn, pressed && { opacity: 0.85 }]}
              onPress={showPaywall}
            >
              <Text style={s.upgradeBtnTxt}>Upgrade to Premium</Text>
            </Pressable>
            <Text style={s.price}>Cancel any time</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {header}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderMessage}
        contentContainerStyle={s.chatList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      />
      <KeyboardAvoidingView
        behavior="padding"
      >
        {showStarters && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.startersList}
            style={s.startersRow}
          >
            {randomStarters.map(s2 => (
              <Pressable
                key={s2}
                style={({ pressed }) => [s.starterPill, pressed && { opacity: 0.7 }]}
                onPress={() => sendStarter(s2)}
              >
                <Text style={s.starterText} numberOfLines={1}>{s2}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {remaining !== null && remaining <= 10 && remaining > 0 && (
          <Text style={s.limitWarning}>
            {remaining} message{remaining === 1 ? '' : 's'} remaining today
          </Text>
        )}
        {remaining === 0 ? (
          <View style={s.limitReached}>
            <Text style={s.limitReachedText}>Daily limit reached — resets at midnight 💙</Text>
          </View>
        ) : (
        <View style={s.inputBar}>
          <TextInput
            style={s.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Message AI Corner…"
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={500}
            editable={!isStreaming}
          />
          <Pressable
            style={({ pressed }) => [
              s.sendBtn,
              (!input.trim() || isStreaming) && s.sendBtnDisabled,
              pressed && input.trim() && !isStreaming && { opacity: 0.8 },
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color={c.white} />
            ) : (
              <Ionicons name="send" size={18} color={c.white} />
            )}
          </Pressable>
        </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (c: AppColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bgScreen },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    header: { paddingBottom: 16 },
    headerContent: {
      paddingHorizontal: 20,
      paddingTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerTitle: { fontSize: 22, fontWeight: '700', color: c.white },
    premiumBadge: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    premiumBadgeTxt: { fontSize: 12, color: c.white, fontWeight: '600' },

    // Paywall
    body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    lockCard: {
      backgroundColor: c.bgCard,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      gap: 14,
      width: '100%',
    },
    lockEmoji: { fontSize: 52 },
    lockTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary, textAlign: 'center' },
    lockDesc: { fontSize: 14, color: c.textBody, textAlign: 'center', lineHeight: 21 },
    featureList: { gap: 10, alignSelf: 'stretch', marginVertical: 4 },
    featureRow: { flexDirection: 'row' },
    featureItem: { fontSize: 15, color: c.textSecondary },
    upgradeBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignSelf: 'stretch',
      alignItems: 'center',
      marginTop: 4,
    },
    upgradeBtnTxt: { color: c.white, fontWeight: '700', fontSize: 16 },
    price: { fontSize: 12, color: c.textFaint },

    // Chat
    chatList: { padding: 16, paddingBottom: 8, gap: 12 },

    msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    msgRowUser: { justifyContent: 'flex-end' },
    msgRowAssistant: { justifyContent: 'flex-start' },

    avatarCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.bgTeal,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    avatarEmoji: { fontSize: 16 },

    bubble: {
      maxWidth: '78%',
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleUser: {
      backgroundColor: c.primary,
      borderBottomRightRadius: 4,
    },
    bubbleAssistant: {
      backgroundColor: c.bgCard,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: c.borderSubtle,
    },
    bubbleText: { fontSize: 15, lineHeight: 22 },
    bubbleTextUser: { color: c.white },
    bubbleTextAssistant: { color: c.textPrimary },

    typingDots: { height: 20, justifyContent: 'center', paddingHorizontal: 4 },

    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.borderSubtle,
      backgroundColor: c.bgCard,
    },
    textInput: {
      flex: 1,
      backgroundColor: c.bgInput,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: Platform.OS === 'ios' ? 10 : 8,
      fontSize: 15,
      color: c.textPrimary,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: c.borderLight,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: c.borderLight },

    limitWarning: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: 4,
      backgroundColor: c.bgScreen,
    },
    limitReached: {
      paddingVertical: 16,
      paddingHorizontal: 20,
      backgroundColor: c.bgCard,
      borderTopWidth: 1,
      borderTopColor: c.borderSubtle,
      alignItems: 'center',
    },
    limitReachedText: {
      fontSize: 14,
      color: c.textMuted,
      textAlign: 'center',
    },

    startersRow: {
      borderTopWidth: 1,
      borderTopColor: c.borderSubtle,
      backgroundColor: c.bgScreen,
    },
    startersList: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      gap: 8,
      alignItems: 'center',
    },
    starterPill: {
      borderWidth: 1,
      borderColor: c.borderTeal,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: c.bgTeal,
    },
    starterText: {
      fontSize: 13,
      color: c.primary,
      fontWeight: '500',
    },
  });
