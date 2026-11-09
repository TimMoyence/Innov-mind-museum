import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

export const TAB_BAR_VISUAL_HEIGHT = 64;
export const TAB_BAR_FLOATING_GAP = 12;

export default function TabLayout() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.textPrimary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: [
          styles.tabBar,
          {
            borderTopColor: theme.glassBorder,
            shadowColor: theme.shadowColor,
            height: TAB_BAR_VISUAL_HEIGHT,
            marginBottom: insets.bottom + TAB_BAR_FLOATING_GAP,
          },
        ],
        tabBarBackground: () => (
          <BlurView
            tint={
              Platform.OS === 'ios'
                ? theme.blurTint === 'dark'
                  ? 'systemChromeMaterialDark'
                  : 'systemChromeMaterialLight'
                : theme.blurTint
            }
            intensity={72}
            style={StyleSheet.absoluteFill}
          />
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

const TAB_BAR_BACKGROUND = 'transparent';

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 1,
    backgroundColor: TAB_BAR_BACKGROUND,
    paddingBottom: semantic.card.gapSmall,
    paddingTop: semantic.card.gapSmall,
    marginHorizontal: semantic.form.gapLarge,
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
