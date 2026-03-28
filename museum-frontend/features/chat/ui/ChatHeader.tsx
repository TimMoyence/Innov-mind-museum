import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ExpertiseBadge } from '@/features/chat/ui/ExpertiseBadge';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

interface ChatHeaderProps {
  sessionTitle: string | null;
  museumName: string | null;
  sessionId: string;
  expertiseLevel?: 'beginner' | 'intermediate' | 'expert';
  isClosing: boolean;
  onClose: () => void;
}

/** Chat session header with title, museum name, expertise badge, and close button. */
export function ChatHeader({
  sessionTitle,
  museumName,
  sessionId,
  expertiseLevel,
  isClosing,
  onClose,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <GlassCard style={styles.headerShell} intensity={58}>
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
          <Text style={[styles.header, { color: theme.textPrimary }]} numberOfLines={1}>
            {sessionTitle ?? t('chat.fallback_title')}
          </Text>
          <View style={styles.headerSubRow}>
            <Text style={[styles.subheader, { color: theme.textTertiary }]} numberOfLines={1}>
              {museumName ?? `${sessionId.slice(0, 12)}...`}
            </Text>
            {expertiseLevel ? <ExpertiseBadge level={expertiseLevel} /> : null}
          </View>
        </View>
        <Pressable
          onPress={onClose}
          style={[
            styles.closeButton,
            { borderColor: theme.inputBorder, backgroundColor: theme.surface },
          ]}
          disabled={isClosing}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          {isClosing ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <Ionicons name="close" size={20} color={theme.textPrimary} />
          )}
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  headerShell: {
    marginBottom: 12,
  },
  headerRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerContent: {
    flex: 1,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
  },
  headerSubRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subheader: {
    fontSize: 12,
  },
  closeButton: {
    borderRadius: 999,
    borderWidth: 1,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
