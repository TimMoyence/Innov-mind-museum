import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useTranslation } from 'react-i18next';

import {
  grantConsentScope,
  listUserConsents,
  revokeConsentScope,
  THIRD_PARTY_AI_SCOPES,
  type ThirdPartyAiScope,
} from '@/features/chat/application/thirdPartyAiConsent';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface ConsentRow {
  scope: ThirdPartyAiScope;
  granted: boolean;
  grantedAt: string | null;
}

const isThirdPartyAiScope = (scope: string): scope is ThirdPartyAiScope =>
  (THIRD_PARTY_AI_SCOPES as readonly string[]).includes(scope);

/**
 * GDPR Art. 7(3) / Apple Guideline 5.1.2(i) revocation surface — lists each
 * third-party-AI consent scope with a one-tap toggle. Granting / revoking
 * round-trips through `/api/auth/consent` so every change writes a
 * hash-chained audit row (`CONSENT_GRANTED_THIRD_PARTY_AI` / `*_REVOKED_*`).
 *
 * Date format follows the CLAUDE.md ISO/Intl doctrine — Intl.DateTimeFormat
 * keyed on (isoString, locale), try/catch falls back to raw ISO if parse fails.
 */
export const SettingsAiConsentCard = () => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  const [rows, setRows] = useState<readonly ConsentRow[]>(() =>
    THIRD_PARTY_AI_SCOPES.map((scope) => ({ scope, granted: false, grantedAt: null })),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [pendingScope, setPendingScope] = useState<ThirdPartyAiScope | null>(null);

  const refresh = useCallback(async () => {
    try {
      const remote = await listUserConsents();
      const byScope = new Map<ThirdPartyAiScope, { granted: boolean; grantedAt: string | null }>();
      for (const row of remote) {
        if (!isThirdPartyAiScope(row.scope)) continue;
        // listForUser returns newest first ; first occurrence wins.
        if (!byScope.has(row.scope)) {
          byScope.set(row.scope, {
            granted: row.revokedAt === null,
            grantedAt: row.revokedAt === null ? row.grantedAt : null,
          });
        }
      }
      setRows(
        THIRD_PARTY_AI_SCOPES.map((scope) => ({
          scope,
          granted: byScope.get(scope)?.granted ?? false,
          grantedAt: byScope.get(scope)?.grantedAt ?? null,
        })),
      );
    } catch {
      // Network or 401 — keep prior state, user can pull-to-refresh on parent screen
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }),
    [i18n.language],
  );

  const formatGrantedAt = (iso: string | null): string => {
    if (!iso) return '';
    try {
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) return iso;
      return dateFormatter.format(parsed);
    } catch {
      return iso;
    }
  };

  const onToggle = useCallback(
    async (scope: ThirdPartyAiScope, next: boolean) => {
      setPendingScope(scope);
      // Optimistic update — revert on failure.
      const previous = rows;
      setRows((curr) =>
        curr.map((r) =>
          r.scope === scope
            ? { ...r, granted: next, grantedAt: next ? new Date().toISOString() : null }
            : r,
        ),
      );
      try {
        if (next) {
          await grantConsentScope(scope);
        } else {
          await revokeConsentScope(scope);
        }
        await refresh();
      } catch (toggleError) {
        Sentry.captureException(toggleError, {
          tags: {
            flow: next ? 'consent.grant.settings' : 'consent.revoke.settings',
            scope,
          },
        });
        setRows(previous);
      } finally {
        setPendingScope(null);
      }
    },
    [rows, refresh],
  );

  return (
    <GlassCard style={styles.card} intensity={56}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
        {t('settings.ai_consent_title')}
      </Text>
      <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
        {t('settings.ai_consent_hint')}
      </Text>

      {isLoading ? (
        <ActivityIndicator color={theme.primary} />
      ) : (
        rows.map((row) => (
          <View key={row.scope} style={styles.row}>
            <View style={styles.info}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>
                {t(`settings.ai_consent_scope.${row.scope}`)}
              </Text>
              {row.granted && row.grantedAt ? (
                <Text style={[styles.hint, { color: theme.textSecondary }]}>
                  {t('settings.ai_consent_granted_on', { date: formatGrantedAt(row.grantedAt) })}
                </Text>
              ) : null}
            </View>
            {pendingScope === row.scope ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Switch
                value={row.granted}
                onValueChange={(v) => void onToggle(row.scope, v)}
                trackColor={{ false: theme.cardBorder, true: theme.primary }}
                accessibilityRole="switch"
                accessibilityLabel={t(`settings.ai_consent_scope.${row.scope}`)}
              />
            )}
          </View>
        ))
      )}
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: semantic.card.padding,
    gap: semantic.form.gap,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: semantic.card.titleSize,
  },
  cardHint: {
    fontSize: semantic.card.captionSize,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['2.5'],
  },
  info: {
    flex: 1,
    gap: space['0.5'],
  },
  label: {
    fontWeight: '600',
    fontSize: semantic.card.bodySize,
  },
  hint: {
    fontSize: semantic.card.captionSize,
  },
});
