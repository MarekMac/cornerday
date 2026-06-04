import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Image, TouchableOpacity, View } from 'react-native';
import { useUser } from '@/context/user';
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

function tabIcon(name: IoniconName, focused: boolean) {
  return <Ionicons name={focused ? name : `${name}-outline` as IoniconName} size={24} color={focused ? '#0F6E6E' : '#666'} />;
}

export default function TabsLayout() {
  const { avatarUrl } = useUser();

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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0F6E6E',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: { backgroundColor: '#111', borderTopColor: '#111', height: 121 },
        tabBarItemStyle: { paddingTop: 10 },
        tabBarButton: (props) => <TouchableOpacity {...props} activeOpacity={1} />,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => tabIcon('home', focused),
        }}
      />
      <Tabs.Screen
        name="tracker"
        options={{
          title: 'Tracker',
          tabBarIcon: ({ focused }) => tabIcon('wallet', focused),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('tracker', { screen: 'index' });
          },
        })}
      />
      <Tabs.Screen
        name="urge"
        options={{
          title: 'Support',
          tabBarIcon: ({ focused }) => tabIcon('heart', focused),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('urge', { screen: 'index' });
          },
        })}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ focused }) => tabIcon('chatbubble', focused),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ focused }) => avatarUrl ? (
            <View style={{ width: 26, height: 26, borderRadius: 13, overflow: 'hidden', borderWidth: focused ? 2 : 0, borderColor: '#0F6E6E' }}>
              <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
            </View>
          ) : tabIcon('person', focused),
        }}
      />
    </Tabs>
  );
}
