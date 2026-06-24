import AsyncStorage from '@react-native-async-storage/async-storage';
import { haptic } from '@/lib/haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import Logo from '@/components/Logo';
import { usePurchases } from '@/context/purchases';
import { useUser } from '@/context/user';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { CHECKLIST_KEY } from '@/constants/storage-keys';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;
const COACH_HISTORY_KEY = 'coach_chat_history';

const FEATURES = [
  { icon: '💬', text: 'Chat any time, day or night' },
  { icon: '🧠', text: 'Evidence-based coping strategies' },
  { icon: '📈', text: 'Personalised to your recovery journey' },
  { icon: '🔒', text: 'Never saved, never shared — only you can read this' },
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

const GREETINGS = [
  "Hi! I'm your AI Corner. I already know a bit about you — your reason for quitting, how your recovery is going, and what you're working toward — so you don't have to start from scratch. I'm here any time you need support. How are you doing today?",
  "Hey, good to see you. I'm your AI Corner — and I already know a little about your journey, so we can get straight into it. Whether you're riding a good streak or having a tough moment, I'm here. What's on your mind?",
  "Hi there. I'm AI Corner, and I've got some context about where you are in your recovery — so no need to explain everything from the start. What would you like to talk about today?",
  "Welcome back. I'm your AI Corner. I know why you're fighting this, how far you've come, and what you're working toward. That's what I'm here for. How are you feeling right now?",
  "Hi! I'm your AI Corner — think of me as someone already in your corner, because I know your story. What's going on for you today?",
  "Hey. I'm here whenever you need me. I already have some background on your recovery, so we can talk about whatever's on your mind without starting from zero. How's today going?",
  "Good to have you here. I'm AI Corner, and I already know a bit about you — your motivation, your progress, what you're up against. I'm ready to listen. What do you need right now?",
  "Hi! I'm your AI Corner. I know a little about your journey — the why behind it, how things are going, and what you're aiming for. You don't have to catch me up. Just tell me what's on your mind.",
  "Hey! I'm AI Corner — your personal support, available any time. I've got some context about where you are in your recovery, so let's just talk. How are you doing today?",
  "Hi. I'm your AI Corner. I already know the important things — why you started, how far you've come, and who's in your corner. I'm here for the rest. What would you like to talk about?",
];

const CHECKIN_GREETING = "You haven't checked in for a few days — how are you doing? I'm here whenever you need to talk.";

function randomGreeting(checkin = false): ChatMessage {
  return {
    id: 'greeting',
    role: 'assistant',
    content: checkin ? CHECKIN_GREETING : GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
  };
}

export default function CoachScreen() {
  const { isPremium, isLoadingPurchases, showPaywall } = usePurchases();
  const { isAdmin } = useUser();
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const hasAccess = isPremium || isAdmin;
  const params = useLocalSearchParams<{ checkin?: string }>();
  const isCheckin = params.checkin === 'true';

  const [messages, setMessages] = useState<ChatMessage[]>(() => [randomGreeting(isCheckin)]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const listRef = useRef<FlatList>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Load persisted chat history on mount
  useEffect(() => {
    AsyncStorage.getItem(COACH_HISTORY_KEY).then(raw => {
      if (!raw || !isMountedRef.current) return;
      try {
        const saved: ChatMessage[] = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length > 0) {
          setMessages([randomGreeting(isCheckin), ...saved]);
        }
      } catch {
        // Corrupted storage — ignore and keep default greeting
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist chat history whenever messages change (skip greeting, limit to 100)
  useEffect(() => {
    const toSave = messages.filter(m => m.id !== 'greeting' && !m.pending).slice(-100);
    if (toSave.length === 0) return;
    AsyncStorage.setItem(COACH_HISTORY_KEY, JSON.stringify(toSave)).catch(() => {});
  }, [messages]);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 80);
  }, []);

  const sendText = useCallback(async (text: string) => {
    if (!text || isStreaming) return;
    if (!hasAccess) { showPaywall(); return; }

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

    const isFirstTurn = apiMessages.length === 1;

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    abortControllerRef.current = new AbortController();
    const abortController = abortControllerRef.current;
    const streamTimeout = setTimeout(() => abortController.abort(), 30_000);
    try {
      const [{ data: { session } }, checklistRaw] = await Promise.all([
        supabase.auth.getSession(),
        isFirstTurn ? AsyncStorage.getItem(CHECKLIST_KEY) : Promise.resolve(null),
      ]);
      if (!session) throw new Error('Not authenticated');

      let checklistState: Record<string, boolean> | undefined;
      if (isFirstTurn && checklistRaw) {
        try { checklistState = JSON.parse(checklistRaw); } catch { /* ignore */ }
      }

      const response = await fetch(`${FUNCTIONS_URL}/ai-coach`, {
        method: 'POST',
        signal: abortController.signal,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: apiMessages, checklistState }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
        if (isMountedRef.current) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  content: errData?.error === 'premium_required'
                    ? 'This feature requires a premium subscription. Upgrade in Settings.'
                    : response.status === 401
                      ? 'Your session has expired. Please sign out and back in, then try again.'
                      : 'Something went wrong. Please try again.',
                  pending: false,
                }
              : m,
          ));
        }
        return;
      }

      if (!response.body) throw new Error('No response body from ai-coach');
      reader = response.body.getReader();
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
              if (isMountedRef.current) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.delta.text, pending: false }
                      : m,
                  ),
                );
                scrollToBottom(false);
              }
            }
          } catch {
            // ignore malformed SSE events
          }
        }
      }
    } catch (err) {
      console.error('ai-coach fetch error:', err);
      if (isMountedRef.current) {
        const isTimeout = err instanceof Error && err.name === 'AbortError';
        const errMsg = isTimeout
          ? "The response took too long. Please try again."
          : "I'm having trouble connecting right now. Please try again in a moment.";
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: m.content.length > 0 ? m.content : errMsg, pending: false }
              : m,
          ),
        );
      }
    } finally {
      clearTimeout(streamTimeout);
      reader?.cancel().catch(() => {});
      if (isMountedRef.current) {
        setIsStreaming(false);
        // Clear pending flag if the stream ended before any text arrived
        setMessages(prev =>
          prev.map(m => (m.id === assistantId && m.pending ? { ...m, pending: false } : m)),
        );
        scrollToBottom();
      }
    }
  }, [isStreaming, messages, scrollToBottom, hasAccess, showPaywall]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (text) { haptic(); sendText(text); }
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
      setMessages(prev => {
        if (prev.length === 1 && prev[0].id === 'greeting') return [randomGreeting(isCheckin)];
        return prev;
      });
    }, [isCheckin]),
  );

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isUser = item.role === 'user';
      return (
        <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowAssistant]}>
          {!isUser && (
            <View style={s.avatarCircle}>
              <Logo size={20} variant="dark" />
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
    <View style={[s.header, { backgroundColor: c.headerBg }]}>
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
    </View>
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
        <ScrollView contentContainerStyle={s.paywallScroll} style={s.paywallBg}>
          <LinearGradient colors={[c.headerGradStart, c.headerGradEnd]} style={s.paywallIcon}>
            <Logo size={36} variant="dark" />
          </LinearGradient>
          <Text style={s.paywallTitle}>AI Corner</Text>
          <Text style={s.paywallSub}>
            Your personal support — available 24/7 and built for gambling recovery.
          </Text>
          <View style={s.featureList}>
            {FEATURES.map((f, i) => (
              <View key={f.text}>
                <View style={s.featureRow}>
                  <View style={s.featureIconCircle}>
                    <Text style={s.featureEmoji}>{f.icon}</Text>
                  </View>
                  <Text style={s.featureText}>{f.text}</Text>
                </View>
                {i < FEATURES.length - 1 && <View style={s.featureDivider} />}
              </View>
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [s.upgradeBtnWrap, pressed && { opacity: 0.88 }]}
            onPress={showPaywall}
          >
            <LinearGradient colors={[c.headerGradStart, c.headerGradEnd]} style={s.upgradeBtn}>
              <Text style={s.upgradeBtnTxt}>Upgrade to Premium</Text>
            </LinearGradient>
          </Pressable>
          <Text style={s.price}>Cancel any time</Text>
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
        {showStarters && (
          <Text style={s.chatPrivacyNote}>🔒 Not saved · Not shared · Private to you</Text>
        )}
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
    paywallBg: { backgroundColor: c.bgCard },
    paywallScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 20 },
    paywallIcon: {
      width: 72, height: 72, borderRadius: 36,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 14,
      shadowColor: '#0F6E6E', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
    },
    paywallTitle: { fontSize: 24, fontWeight: '800', color: c.textPrimary, marginBottom: 6, textAlign: 'center' },
    paywallSub: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
    featureList: { alignSelf: 'stretch', marginBottom: 24 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 0 },
    featureDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.borderSubtle },
    featureIconCircle: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.bgTeal, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    featureEmoji: { fontSize: 17 },
    featureText: { flex: 1, fontSize: 14, color: c.textSecondary, lineHeight: 20 },
    upgradeBtnWrap: { alignSelf: 'stretch', borderRadius: 16, overflow: 'hidden' },
    upgradeBtn: { paddingVertical: 15, alignItems: 'center' },
    upgradeBtnTxt: { color: c.white, fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },
    price: { fontSize: 12, color: c.textFaint, marginTop: 10 },

    // Chat
    chatList: { padding: 16, paddingBottom: 8, gap: 12 },

    msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    msgRowUser: { justifyContent: 'flex-end' },
    msgRowAssistant: { justifyContent: 'flex-start' },

    avatarCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },

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

    chatPrivacyNote: {
      fontSize: 11,
      color: c.textFaint,
      textAlign: 'center',
      paddingVertical: 4,
      backgroundColor: c.bgCard,
    },
  });
