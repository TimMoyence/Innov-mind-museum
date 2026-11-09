import React, { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { CitationSource } from '@/features/chat/application/chatSessionLogic.pure';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic, space } from '@/shared/ui/tokens';

interface SourceCitationProps {
  source: CitationSource;
  index: number;
}

export const SourceCitation = React.memo(({ source, index }: SourceCitationProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const openSheet = () => {
    setSheetOpen(true);
  };
  const closeSheet = () => {
    setSheetOpen(false);
  };
  const openUrl = () => {
    void Linking.openURL(source.url);
  };

  const hasQuote = source.quote.length > 0;

  return (
    <>
      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={t('chat.sources.viewSource')}
        hitSlop={6}
        style={styles.marker}
        testID="source-citation-marker"
      >
        <Text style={[styles.markerText, { color: theme.primary }]}>{`[${String(index)}]`}</Text>
      </Pressable>

      <Modal
        animationType="slide"
        transparent
        visible={sheetOpen}
        onRequestClose={closeSheet}
        statusBarTranslucent
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: theme.modalOverlay }]}
          onPress={closeSheet}
          accessibilityLabel={t('chat.sources.closeSheet')}
        />
        <SafeAreaView
          edges={['bottom']}
          style={[
            styles.sheet,
            { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.separator }]} />
          <View style={styles.sheetHeader}>
            <Text
              style={[styles.title, { color: theme.textPrimary }]}
              numberOfLines={2}
              accessibilityRole="header"
            >
              {source.title}
            </Text>
            <Pressable
              onPress={closeSheet}
              accessibilityRole="button"
              accessibilityLabel={t('chat.sources.closeSheet')}
              hitSlop={8}
              testID="source-citation-close"
            >
              <Ionicons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.quoteScroll}
            contentContainerStyle={styles.quoteContent}
            showsVerticalScrollIndicator
          >
            <Text style={[styles.quoteLabel, { color: theme.textTertiary }]}>
              {t('chat.sources.quoteFromSource')}
            </Text>
            <Text style={[styles.quote, { color: theme.textSecondary }]}>
              {hasQuote ? source.quote : t('chat.sources.noQuote')}
            </Text>
          </ScrollView>

          <Pressable
            onPress={openUrl}
            accessibilityRole="button"
            accessibilityLabel={t('chat.sources.openLink')}
            style={[styles.openButton, { borderColor: theme.primaryBorderSubtle }]}
            testID="source-citation-open-url"
          >
            <Ionicons name="open-outline" size={18} color={theme.primary} />
            <Text style={[styles.openButtonText, { color: theme.primary }]}>
              {t('chat.sources.openLink')}
            </Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </>
  );
});
SourceCitation.displayName = 'SourceCitation';

const styles = StyleSheet.create({
  marker: {
    marginHorizontal: space['0.5'],
  },
  markerText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    lineHeight: fontSize.xs * 1.2,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    borderTopLeftRadius: semantic.card.radius,
    borderTopRightRadius: semantic.card.radius,
    paddingHorizontal: semantic.screen.padding,
    paddingTop: space['2'],
    paddingBottom: semantic.screen.paddingLarge,
    borderWidth: semantic.input.borderWidth,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: space['2'],
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: space['2'],
    gap: space['2'],
  },
  title: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  quoteScroll: {
    maxHeight: 240,
    marginBottom: space['3'],
  },
  quoteContent: {
    paddingBottom: space['2'],
  },
  quoteLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    marginBottom: space['1'],
    letterSpacing: 0.5,
  },
  quote: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.5,
    fontStyle: 'italic',
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['1.5'],
    paddingVertical: space['2'],
    paddingHorizontal: space['3'],
    borderRadius: semantic.input.radius,
    borderWidth: semantic.input.borderWidth,
  },
  openButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
