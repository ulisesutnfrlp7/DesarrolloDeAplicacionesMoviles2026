//app/(tabs)/_layout.tsx
import "react-native-get-random-values";
import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useNotifications } from '../../hooks/useNotifications';
import { useUserRole } from '../../hooks/useUserRole';
import { badgeLabel } from '../../types/notifications';

export default function TabLayout() {
  const { rol, loading: loadingRol } = useUserRole();
  const notificationsEnabled = !loadingRol && rol === "alumno";
  const { unreadCount } = useNotifications({ enabled: notificationsEnabled });
  const badge = badgeLabel(unreadCount);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0F4A32',
        tabBarInactiveTintColor: '#666666',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E0E0E0',
          height: 65,
          paddingBottom: 10,
          paddingTop: 5,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-sharp" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="cronograma"
        options={{
          title: 'Cronograma',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="notificaciones"
        options={{
          href: notificationsEnabled ? undefined : null,
          title: 'Notificaciones',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="notifications-outline" size={size} color={color} />
              {badge ? (
                <View style={{
                  position: 'absolute',
                  right: -10,
                  top: -6,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: '#DC2626',
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{badge}</Text>
                </View>
              ) : null}
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
