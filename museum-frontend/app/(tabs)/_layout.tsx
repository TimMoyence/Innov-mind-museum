import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

/** Renders the bottom tab navigator with Dashboard and Home tabs using a frosted-glass tab bar. */
export default function TabLayout() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.textPrimary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: [
          styles.tabBar,
          { borderTopColor: theme.glassBorder, shadowColor: theme.shadowColor },
        ],
        tabBarBackground: () => (
          <BlurView tint={theme.blurTint} intensity={72} style={StyleSheet.absoluteFill} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="museums"
        options={{
          title: t('tabs.museums'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // eslint-disable-next-line react-native/no-color-literals -- transparent is a standard value
  tabBar: {
    position: 'absolute',
    borderTopWidth: 1,
    backgroundColor: 'transparent',
    height: semantic.media.tabBarHeight,
    paddingBottom: semantic.form.gapLarge,
    paddingTop: semantic.card.gapSmall,
    marginHorizontal: semantic.form.gapLarge,
    marginBottom: semantic.card.gap,
    borderRadius: semantic.badge.radiusFull,
    overflow: 'hidden',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  tabLabel: {
    fontSize: semantic.badge.fontSizeSmall,
    fontWeight: '700',
  },
});
