import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, router, usePathname } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import {
  configureNotificationHandler,
  DEFAULT_NOTIF_PREFS,
  NotifPrefs,
  requestNotificationPermissions,
  scheduleAllNotifications,
  setupAndroidChannel,
} from '@/lib/notifications';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, IoniconName> = {
  index: 'home',
  tracker: 'wallet',
  urge: 'heart',
  coach: 'chatbubble',
  community: 'people',
};

const TAB_ROUTES = ['index', 'tracker', 'urge', 'coach', 'community'];
const SCREEN_W = Dimensions.get('window').width;

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
  const pillAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const labelAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pillAnim, { toValue: isFocused ? 1 : 0, speed: 20, bounciness: 3, useNativeDriver: true }),
      Animated.spring(labelAnim, { toValue: isFocused ? 1 : 0, speed: 18, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [isFocused]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.80, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 10, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[tbs.tab, isFocused && tbs.tabActive]}
    >
      {/* Animated teal pill background */}
      <Animated.View style={[StyleSheet.absoluteFill, tbs.pillBg, { opacity: pillAnim }]} />

      <Animated.View style={[tbs.tabInner, { transform: [{ scale }] }]}>
        <Ionicons
          name={isFocused ? iconName : `${iconName}-outline` as IoniconName}
          size={20}
          color={isFocused ? '#fff' : '#888'}
        />
        {isFocused && (
          <Animated.View style={{ opacity: labelAnim, transform: [{ scale: labelAnim }] }}>
            <Text style={tbs.label} numberOfLines={1}>{label}</Text>
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Custom Tab Bar ───────────────────────────────────────────────────────────

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const visibleRoutes = state.routes.filter(r => r.name !== 'account');

  return (
    <View style={[tbs.wrapper, { paddingBottom: Math.max(insets.bottom + (Platform.OS === 'android' ? 12 : 0), 20) }]}>
      <View style={tbs.bar}>
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const isFocused = state.routes[state.index]?.name === route.name;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <TabButton
              key={route.key}
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
    backgroundColor: '#1a1a1a',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
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
  pillBg: { borderRadius: 22, backgroundColor: '#0F6E6E' },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 4,
  },
  label: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
});

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const pathname = usePathname();
  const currentIndexRef = useRef(0);
  const navigateRef = useRef((_i: number) => {});

  // Screen transition animation
  const screenAnim = useRef(new Animated.Value(0)).current;
  const dragAnim = useRef(new Animated.Value(0)).current;
  const directionRef = useRef(0); // -1 left, +1 right

  useEffect(() => {
    const segment = pathname.replace('/(tabs)', '').replace(/^\//, '').split('/')[0] || 'index';
    const idx = TAB_ROUTES.indexOf(segment);
    if (idx !== -1) currentIndexRef.current = idx;
  }, [pathname]);

  // Fade+slide in when pathname changes
  useEffect(() => {
    screenAnim.setValue(directionRef.current * 0.04 * SCREEN_W);
    Animated.parallel([
      Animated.spring(screenAnim, { toValue: 0, speed: 22, bounciness: 4, useNativeDriver: true }),
    ]).start();
  }, [pathname]);

  navigateRef.current = (index: number) => {
    const route = TAB_ROUTES[index];
    router.navigate(route === 'index' ? '/(tabs)' : `/(tabs)/${route}` as any);
  };

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 30 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_, g) => {
        const idx = currentIndexRef.current;
        const atStart = idx === 0 && g.dx > 0;
        const atEnd = idx === TAB_ROUTES.length - 1 && g.dx < 0;
        if (atStart || atEnd) {
          dragAnim.setValue(g.dx * 0.08); // resist at edges
        } else {
          dragAnim.setValue(g.dx * 0.25); // damped follow
        }
      },
      onPanResponderRelease: (_, g) => {
        const idx = currentIndexRef.current;
        const shouldNext = g.vx < -0.4 && g.dx < -50 && idx < TAB_ROUTES.length - 1;
        const shouldPrev = g.vx > 0.4 && g.dx > 50 && idx > 0;

        if (shouldNext || shouldPrev) {
          directionRef.current = shouldNext ? -1 : 1;
          const exitX = shouldNext ? -SCREEN_W * 0.15 : SCREEN_W * 0.15;
          Animated.timing(dragAnim, { toValue: exitX, duration: 120, useNativeDriver: true }).start(() => {
            dragAnim.setValue(0);
            navigateRef.current(shouldNext ? idx + 1 : idx - 1);
          });
        } else {
          directionRef.current = 0;
          Animated.spring(dragAnim, { toValue: 0, speed: 20, bounciness: 6, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragAnim, { toValue: 0, speed: 20, bounciness: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  useEffect(() => {
    configureNotificationHandler();
    const init = async () => {
      await setupAndroidChannel();
      const granted = await requestNotificationPermissions();
      if (!granted) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('quit_timestamp, notif_milestone, notif_daily_streak, notif_daily_checkin, notif_weekly_summary, notif_milestone_approaching')
        .eq('id', user.id)
        .single();
      if (!data) return;
      const prefs: NotifPrefs = {
        notif_milestone: data.notif_milestone ?? DEFAULT_NOTIF_PREFS.notif_milestone,
        notif_daily_streak: data.notif_daily_streak ?? DEFAULT_NOTIF_PREFS.notif_daily_streak,
        notif_daily_checkin: data.notif_daily_checkin ?? DEFAULT_NOTIF_PREFS.notif_daily_checkin,
        notif_weekly_summary: data.notif_weekly_summary ?? DEFAULT_NOTIF_PREFS.notif_weekly_summary,
        notif_milestone_approaching: data.notif_milestone_approaching ?? DEFAULT_NOTIF_PREFS.notif_milestone_approaching,
      };
      await scheduleAllNotifications(prefs, data.quit_timestamp ?? null);
    };
    init();

    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen) router.push(screen as any);
    });
    return () => sub.remove();
  }, []);

  return (
    <Animated.View
      style={[{ flex: 1 }, { transform: [{ translateX: Animated.add(screenAnim, dragAnim) }] }]}
      {...swipe.panHandlers}
    >
      <Tabs
        tabBar={props => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: '#1a1a1a', borderTopWidth: 0, elevation: 0 },
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
        <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
        <Tabs.Screen
          name="community"
          options={{ title: 'Community' }}
          listeners={({ navigation }) => ({
            tabPress: (e) => { e.preventDefault(); navigation.navigate('community', { screen: 'index' }); },
          })}
        />
        <Tabs.Screen name="account" options={{ href: null }} />
      </Tabs>
    </Animated.View>
  );
}
