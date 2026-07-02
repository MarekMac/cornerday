import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Tabs, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { TimerProvider, useTimer } from '@/lib/TimerContext';
import { MilestoneCelebrationModal } from '@/components/MilestoneCelebrationModal';
import { registerCelebrationHandler, unregisterCelebrationHandler, CelebrationPayload } from '@/lib/celebrationBus';
import {
  configureNotificationHandler,
  DEFAULT_NOTIF_PREFS,
  NotifPrefs,
  requestNotificationPermissions,
  scheduleAllNotifications,
  scheduleOnboardingCheckin,
  setupAndroidChannel,
} from '@/lib/notifications';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Tab bar is intentionally always dark regardless of app theme — it floats over content.
const TAB_BAR_BG   = '#1a1a1a';
const TAB_PILL_BG  = '#0F6E6E'; // brand primary
const TAB_TIMER_BG = '#c0392b'; // always-red for the in-progress urge timer

const TAB_ICONS: Record<string, IoniconName> = {
  index: 'home',
  tracker: 'wallet',
  urge: 'heart',
  coach: 'chatbubble',
  community: 'people',
};

// ─── Tab Button ───────────────────────────────────────────────────────────────

function TabButton({
  route,
  isFocused,
  label,
  onPress,
}: {
  route: string;
  isFocused: boolean;
  label: string;
  onPress: () => void;
}) {
  const iconName = TAB_ICONS[route] ?? 'ellipse';
  const scale = useRef(new Animated.Value(1)).current;
  const activeAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const { timerRunning, timerDisplay } = useTimer();

  const isUrge = route === 'urge';
  const showTimer = isUrge && timerRunning;

  useEffect(() => {
    Animated.timing(activeAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isFocused]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.80, duration: 75, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 10, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[tbs.tab, (isFocused || showTimer) && tbs.tabActive]}
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, tbs.pillBg, { opacity: activeAnim }, showTimer && !isFocused && tbs.pillBgTimer]} />
      <Animated.View style={[tbs.tabInner, { transform: [{ scale }] }]}>
        <Ionicons
          name={isFocused ? iconName : `${iconName}-outline` as IoniconName}
          size={20}
          color={isFocused || showTimer ? '#fff' : '#888'}
        />
        {(isFocused || showTimer) && (
          <Animated.View style={isFocused ? { opacity: activeAnim, transform: [{ scale: activeAnim }] } : undefined}>
            <Text style={tbs.label} numberOfLines={1}>
              {showTimer ? `⏱ ${timerDisplay}` : label}
            </Text>
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Custom Tab Bar ───────────────────────────────────────────────────────────

// @react-navigation/bottom-tabs isn't a direct/resolvable dependency of this
// project (only pulled in transitively via expo-router), so BottomTabBarProps
// can't be imported here. The prop shape is only loosely typed as a result —
// same as before, since the unresolved import already made it effectively
// untyped — but this is deliberate instead of a broken import.
function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const visibleRoutes = state.routes.filter((r: any) => r.name !== 'account');

  return (
    <View style={[tbs.wrapper, { paddingBottom: Math.max(insets.bottom + (Platform.OS === 'android' ? 12 : 0), 20) }]}>
      <View style={tbs.bar}>
        {visibleRoutes.map((route: any) => {
          const { options } = descriptors[route.key];
          const isFocused = state.routes[state.index]?.name === route.name;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <TabButton
              key={route.name}
              route={route.name}
              isFocused={isFocused}
              label={options.title ?? route.name}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const tbs = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 14,
    paddingTop: 6,
    backgroundColor: TAB_BAR_BG,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: TAB_BAR_BG,
    borderRadius: 28,
    padding: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 22,
    overflow: 'hidden',
  },
  tabActive: { flex: 2 },
  pillBg: { borderRadius: 22, backgroundColor: TAB_PILL_BG },
  pillBgTimer: { backgroundColor: TAB_TIMER_BG },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  label: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
});

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const [celebPayload, setCelebPayload] = useState<CelebrationPayload | null>(null);
  // triggerCelebration() is a single-slot event bus with no queue of its own
  // (see celebrationBus.ts) — a second celebration firing before the first
  // one's modal was dismissed used to silently overwrite and lose it. Queue
  // here instead. A ref (not celebPayload state) tracks "currently showing"
  // since the handler below is registered once and would otherwise close
  // over a stale null forever.
  const celebPayloadRef = useRef<CelebrationPayload | null>(null);
  const celebQueueRef = useRef<CelebrationPayload[]>([]);

  const advanceCelebration = useCallback(() => {
    const next = celebQueueRef.current.shift() ?? null;
    celebPayloadRef.current = next;
    setCelebPayload(next);
  }, []);

  useEffect(() => {
    const handler = (p: CelebrationPayload) => {
      if (celebPayloadRef.current) {
        celebQueueRef.current.push(p);
      } else {
        celebPayloadRef.current = p;
        setCelebPayload(p);
      }
    };
    registerCelebrationHandler(handler);
    return () => unregisterCelebrationHandler(handler);
  }, []);

  useEffect(() => {
    configureNotificationHandler();
    const init = async () => {
      await setupAndroidChannel();
      const granted = await requestNotificationPermissions();
      if (!granted) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data }, { data: badgeData }] = await Promise.all([
        supabase
          .from('users')
          .select('quit_timestamp, notif_milestone, notif_daily_streak, notif_daily_checkin, notif_weekly_summary, notif_milestone_approaching, notif_urge_prediction, notif_community')
          .eq('id', user.id)
          .maybeSingle(),
        supabase.from('badges').select('badge_type').eq('user_id', user.id),
      ]);
      if (!data) return;
      const prefs: NotifPrefs = {
        notif_milestone: data.notif_milestone ?? DEFAULT_NOTIF_PREFS.notif_milestone,
        notif_daily_streak: data.notif_daily_streak ?? DEFAULT_NOTIF_PREFS.notif_daily_streak,
        notif_daily_checkin: data.notif_daily_checkin ?? DEFAULT_NOTIF_PREFS.notif_daily_checkin,
        notif_weekly_summary: data.notif_weekly_summary ?? DEFAULT_NOTIF_PREFS.notif_weekly_summary,
        notif_milestone_approaching: data.notif_milestone_approaching ?? DEFAULT_NOTIF_PREFS.notif_milestone_approaching,
        notif_urge_prediction: data.notif_urge_prediction ?? DEFAULT_NOTIF_PREFS.notif_urge_prediction,
        notif_community: data.notif_community ?? DEFAULT_NOTIF_PREFS.notif_community,
      };
      const earnedBadgeTypes = (badgeData ?? []).map((b: any) => b.badge_type);
      await scheduleAllNotifications(prefs, data.quit_timestamp ?? null, earnedBadgeTypes);
      await scheduleOnboardingCheckin();

      // Save Expo push token for push notifications
      try {
        const projectId =
          Constants.easConfig?.projectId ??
          (Constants.expoConfig?.extra as any)?.eas?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        const newToken = tokenData?.data;
        if (newToken && newToken.startsWith('ExponentPushToken[')) {
          // Only write to DB if the token has changed — avoids a redundant update on every app open
          const { data: existing } = await supabase
            .from('users')
            .select('expo_push_token')
            .eq('id', user.id)
            .maybeSingle();
          if (existing?.expo_push_token !== newToken) {
            await supabase
              .from('users')
              .update({ expo_push_token: newToken })
              .eq('id', user.id);
            if (__DEV__) console.log('[CornerDay] Push token saved:', newToken);
          }
        } else if (newToken) {
          if (__DEV__) console.warn('[CornerDay] Unexpected push token format (FCM misconfigured?):', newToken);
        }
      } catch (e) {
        // Push token unavailable — non-fatal, but log in dev so FCM issues are visible
        if (__DEV__) console.warn('[CornerDay] Push token registration failed:', e);
      }
    };
    init();

    let sub: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | null = null;
    try {
      sub = Notifications.addNotificationResponseReceivedListener(response => {
        const screen = response.notification.request.content.data?.screen as string | undefined;
        if (screen) {
          try { router.push(screen as any); } catch (_e) {}
        }
      });
    } catch (_e) {}
    return () => sub?.remove();
  }, []);

  return (
    <TimerProvider>
      {celebPayload && (
        <MilestoneCelebrationModal
          badge={celebPayload}
          tagline={celebPayload.celebration.text}
          isTimeBadge={false}
          onShare={async () => {
            const p = celebPayload;
            advanceCelebration();
            await Share.share({ message: `${p.emoji} ${p.label} — I hit a milestone on CornerDay! #CornerDay` });
          }}
          onClose={advanceCelebration}
        />
      )}
      <Tabs
        tabBar={props => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: TAB_BAR_BG, borderTopWidth: 0, elevation: 0 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen
          name="tracker"
          options={{ title: 'Tracker' }}
          listeners={({ navigation }) => ({
            tabPress: (e) => { e.preventDefault(); navigation.navigate('tracker', { screen: 'index' }); },
          })}
        />
        <Tabs.Screen
          name="urge"
          options={{ title: 'Support' }}
          listeners={({ navigation }) => ({
            tabPress: (e) => { e.preventDefault(); navigation.navigate('urge', { screen: 'index' }); },
          })}
        />
        <Tabs.Screen name="coach" options={{ title: 'Corner' }} />
        <Tabs.Screen
          name="community"
          options={{ title: 'Community' }}
          listeners={({ navigation }) => ({
            tabPress: (e) => { e.preventDefault(); navigation.navigate('community', { screen: 'index' }); },
          })}
        />
        <Tabs.Screen name="account" options={{ href: null }} />
      </Tabs>
    </TimerProvider>
  );
}
