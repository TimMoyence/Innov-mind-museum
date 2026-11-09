import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { clearConsentAcceptedFlag } from '@/features/chat/application/useAiConsent';
import { consentApi } from '@/features/chat/infrastructure/consentApi';
import { useLatestSaveOutcome } from '@/features/settings/application/useLatestSaveOutcome';
import { settleWrite } from '@/features/settings/infrastructure/accountPreference';
import { SaveRefusalNotice } from '@/features/settings/ui/SaveRefusalNotice';
import {
  REQUIRED_CONSENT_SCOPE,
  THIRD_PARTY_AI_SCOPES,
  type ThirdPartyAiScope,
} from '@/features/chat/domain/consentScopes';
import { formatAppDate } from '@/shared/lib/formatDate';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface ConsentRow {
  scope: ThirdPartyAiScope;
  granted: boolean;
  grantedAt: string | null;
}

const GEO_SCOPES: readonly ThirdPartyAiScope[] = ['location_to_llm', 'location_coarse_to_llm'];

const isThirdPartyAiScope = (scope: string): scope is ThirdPartyAiScope =>
  (THIRD_PARTY_AI_SCOPES as readonly string[]).includes(scope);

export const SettingsAiConsentCard = () => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  const [rows, setRows] = useState<readonly ConsentRow[]>(() =>
    THIRD_PARTY_AI_SCOPES.map((scope) => ({ scope, granted: false, grantedAt: null })),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [pendingScope, setPendingScope] = useState<ThirdPartyAiScope | null>(null);
  const { refusal, track } = useLatestSaveOutcome();

  const refresh = useCallback(async () => {
    try {
      const remote = await consentApi.list();
      const byScope = new Map<ThirdPartyAiScope, { granted: boolean; grantedAt: string | null }>();
      for (const row of remote) {
        if (!isThirdPartyAiScope(row.scope)) continue;
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
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grantedOn = (row: ConsentRow): string | null =>
    row.granted && row.grantedAt
      ? formatAppDate(row.grantedAt, i18n.language, { dateStyle: 'medium' })
      : null;

  const onToggle = useCallback(
    async (scope: ThirdPartyAiScope, next: boolean) => {
      setPendingScope(scope);
      const previous = rows;
      const geoToRevoke =
        next && GEO_SCOPES.includes(scope)
          ? previous
              .filter((r) => r.scope !== scope && GEO_SCOPES.includes(r.scope) && r.granted)
              .map((r) => r.scope)
          : [];
      setRows((curr) =>
        curr.map((r) => {
          if (r.scope === scope) {
            return { ...r, granted: next, grantedAt: next ? new Date().toISOString() : null };
          }
          if (geoToRevoke.includes(r.scope)) {
            return { ...r, granted: false, grantedAt: null };
          }
          return r;
        }),
      );
      const writeOnServer = async (): Promise<void> => {
        if (next) {
          await consentApi.grant(scope);
          for (const other of geoToRevoke) {
            await consentApi.revoke(other);
          }
        } else {
          await consentApi.revoke(scope);
          if (scope === REQUIRED_CONSENT_SCOPE) {
            await clearConsentAcceptedFlag();
          }
        }
      };
      const refusal = await track(
        settleWrite(writeOnServer(), next ? 'consent.grant.settings' : 'consent.revoke.settings', {
          scope,
        }),
        scope,
      );
      if (refusal) setRows(previous);
      await refresh();
      setPendingScope((current) => (current === scope ? null : current));
    },
    [rows, refresh, track],
  );

  return (
    <GlassCard style={styles.card} intensity={56}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
        {t('settings.ai_consent_title')}
      </Text>
      <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
        {t('ai_disclosure.chat_footer')}
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
              {grantedOn(row) ? (
                <Text style={[styles.hint, { color: theme.textSecondary }]}>
                  {t('settings.ai_consent_granted_on', { date: grantedOn(row) })}
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
      <SaveRefusalNotice refusal={refusal} />
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
