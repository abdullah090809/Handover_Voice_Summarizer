import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { notificationApi } from '@/lib/api';

// Configure how notifications are handled when the app is in the foreground.
// expo-notifications' NotificationBehavior type now requires
// shouldShowBanner/shouldShowList (replacing the old shouldShowAlert) --
// this is a type-level change only, not a behavior change; keeping
// shouldShowAlert too is harmless/ignored by the newer runtime but the type
// requires the two new fields to compile.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(isAuthenticated: boolean) {
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // Bug fix: this used to be ONE effect keyed on [isAuthenticated, router],
  // which meant that on logout, React tore down these native notification
  // listener subscriptions in the exact same commit as the Stack.Protected
  // navigator swap (isAuthenticated flipping false unmounts the whole
  // (tabs) tree -- see more.tsx's own comment on the 250ms logout() defer
  // for the same class of bug: stacking multiple native view-hierarchy
  // teardowns on one tick crashes Android, especially with
  // edgeToEdgeEnabled: true). Before push notifications actually worked,
  // this listener-removal cleanup was a no-op, so the crash never
  // surfaced. Now that registration succeeds, logout tears down real
  // subscriptions at the same moment as the nav swap -- a fourth
  // simultaneous native transition on top of the three more.tsx already
  // works around.
  //
  // Fix: the OS-level listener subscriptions don't need to depend on
  // isAuthenticated at all -- split into two effects. This one mounts the
  // listeners once for the app's lifetime and never tears them down on
  // logout (only on RootNavigator unmount, i.e. app close), so logout no
  // longer touches native notification state. The token
  // registration/backend call below still correctly gates on
  // isAuthenticated in its own effect.
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Foreground notification received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('Notification tapped, payload data:', data);

      if (data && data.handover_note_id) {
        router.push({
          pathname: '/handover/[id]',
          params: { id: String(data.handover_note_id) },
        });
      }
    });

    return () => {
      // Newer expo-notifications removed the static
      // Notifications.removeNotificationSubscription() helper -- each
      // Subscription object returned by addNotificationReceivedListener/
      // addNotificationResponseReceivedListener now has its own .remove()
      // method instead.
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        notificationApi
          .registerDevice(token, Platform.OS, Device.modelName || undefined)
          .then(() => {
            console.log('Push token registered successfully with backend.');
          })
          .catch((err) => {
            console.error('Failed to register push token with backend:', err);
          });
      }
    });
  }, [isAuthenticated]);
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === 'web') {
    return null;
  }

  // Set up Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  // Device checking: only request permission on physical devices
  if (!Device.isDevice) {
    console.warn('Must use physical device for Push Notifications');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Failed to get push token for push notification: Permission denied');
    return null;
  }

  try {
    // Get EAS project ID from Expo config
    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.warn('Project ID not found in EAS config or expoConfig.extra.eas.projectId');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenData.data;
    console.log('Fetched Expo Push Token:', token);

    // Save token to SecureStore so logout can unregister it
    await SecureStore.setItemAsync('device_push_token', token);
  } catch (error) {
    console.error('Error fetching Expo Push Token:', error);
  }

  return token;
}
