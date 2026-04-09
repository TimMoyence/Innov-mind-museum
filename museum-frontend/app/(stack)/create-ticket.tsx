import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ticketApi } from '@/features/support/infrastructure/ticketApi';
import type { components } from '@/shared/api/generated/openapi';
import { getErrorMessage } from '@/shared/lib/errors';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { semantic, space, fontSize } from '@/shared/ui/tokens';

import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

type Priority = components['schemas']['TicketDTO']['priority'];

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const SHADOW_TRANSPARENT = 'transparent';

const priorityColor = (priority: Priority): string => {
  switch (priority) {
    case 'low':
      return semantic.statusBadge.closed;
    case 'medium':
      return semantic.statusBadge.inProgress;
    case 'high':
      return semantic.statusBadge.priorityHigh;
  }
};

/** Renders the create ticket form with subject, description, and priority selection. */
export default function CreateTicketScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const priorityLabel = (p: Priority): string => {
    const map: Record<Priority, string> = {
      low: t('tickets.priorityLow'),
      medium: t('tickets.priorityMedium'),
      high: t('tickets.priorityHigh'),
    };
    return map[p];
  };

  const isValid = subject.trim().length >= 3 && description.trim().length >= 10;

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await ticketApi.createTicket({
        subject: subject.trim(),
        description: description.trim(),
        priority,
      });
      Alert.alert(t('tickets.ticketCreated'));
      router.replace({
        pathname: '/(stack)/ticket-detail',
        params: { ticketId: response.ticket.id },
      });
    } catch (submitError) {
      Alert.alert(t('common.error'), getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LiquidScreen
      background={pickMuseumBackground(3)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <GlassCard style={styles.formCard} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {t('tickets.createTicket')}
          </Text>

          <Text style={[styles.label, { color: theme.textSecondary }]}>{t('tickets.subject')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.textPrimary,
                backgroundColor: theme.inputBackground,
                borderColor: theme.inputBorder,
              },
            ]}
            value={subject}
            onChangeText={setSubject}
            placeholder={t('tickets.subjectPlaceholder')}
            placeholderTextColor={theme.placeholderText}
            maxLength={200}
            editable={!isSubmitting}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>
            {t('tickets.description')}
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.multilineInput,
              {
                color: theme.textPrimary,
                backgroundColor: theme.inputBackground,
                borderColor: theme.inputBorder,
              },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('tickets.descriptionPlaceholder')}
            placeholderTextColor={theme.placeholderText}
            multiline
            maxLength={5000}
            editable={!isSubmitting}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>
            {t('tickets.priority')}
          </Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => (
              <Pressable
                key={p}
                style={[
                  styles.priorityPill,
                  {
                    backgroundColor: priority === p ? priorityColor(p) : theme.cardBackground,
                    borderColor: priority === p ? priorityColor(p) : theme.cardBorder,
                  },
                ]}
                onPress={() => {
                  setPriority(p);
                }}
                accessibilityRole="button"
                accessibilityLabel={priorityLabel(p)}
              >
                <Text
                  style={[
                    styles.priorityPillText,
                    {
                      color: priority === p ? theme.primaryContrast : theme.textPrimary,
                    },
                  ]}
                >
                  {priorityLabel(p)}
                </Text>
              </Pressable>
            ))}
          </View>
        </GlassCard>

        <Pressable
          style={[
            styles.submitButton,
            {
              backgroundColor: isValid ? theme.primary : theme.cardBorder,
            },
            { shadowColor: isValid ? theme.primary : SHADOW_TRANSPARENT },
          ]}
          onPress={() => void handleSubmit()}
          disabled={!isValid || isSubmitting}
          accessibilityRole="button"
          accessibilityLabel={t('tickets.submitTicket')}
        >
          <Text style={[styles.submitButtonText, { color: theme.primaryContrast }]}>
            {isSubmitting ? t('tickets.sending') : t('tickets.submitTicket')}
          </Text>
        </Pressable>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: semantic.card.paddingLarge,
  },
  scrollContent: {
    gap: semantic.screen.gapSmall,
    paddingBottom: space['8'],
  },
  formCard: {
    padding: semantic.card.paddingLarge,
    gap: semantic.form.gap,
  },
  title: {
    fontSize: semantic.section.titleSizeLarge,
    fontWeight: '700',
    marginBottom: space['1'],
  },
  label: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
    marginTop: space['1'],
  },
  input: {
    borderRadius: semantic.input.radius,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: semantic.chat.bubblePaddingX,
    paddingVertical: semantic.button.paddingY,
    fontSize: fontSize.sm,
  },
  multilineInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: space['2.5'],
    marginTop: space['1'],
  },
  priorityPill: {
    flex: 1,
    paddingVertical: space['2.5'],
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
  },
  priorityPillText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
  submitButton: {
    borderRadius: semantic.button.radius,
    paddingVertical: semantic.button.paddingYCompact,
    alignItems: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  submitButtonText: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
});
