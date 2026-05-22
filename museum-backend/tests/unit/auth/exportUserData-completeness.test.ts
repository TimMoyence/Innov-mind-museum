/**
 * RED (T3.1) — DSAR (GDPR Art.15/20) export completeness (B3, R12–R14).
 *
 * The export payload must include the previously-omitted personal-data
 * categories — UserMemory, the user's own audit_logs, message_feedback,
 * message_reports, social_accounts, api_keys — plus previously-omitted User
 * and ChatSession columns; `schemaVersion` bumps `'1'` → `'2'`; and NO secret /
 * credential key may appear anywhere in the serialized payload (R14).
 *
 * Dependency-key contract for the green phase (T3.3 / T3.4) — the use case's
 * `ExportUserDataDeps` must read these ports:
 *   userMemoryExport.getForUser(userId)
 *   auditLogExport.listForUser(userId)
 *   messageFeedbackExport.listForUser(userId)
 *   messageReportExport.listForUser(userId)
 *   socialAccountExport.listForUser(userId)
 *   apiKeyExport.listForUser(userId)
 *
 * FAILS at red baseline: the current `ExportUserDataUseCase` ignores these
 * ports, returns `schemaVersion: '1'`, and omits the new categories/columns.
 */
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import { makeApiKey } from 'tests/helpers/auth/apiKey.fixtures';
import { makeSocialAccount } from 'tests/helpers/auth/socialAccount.fixtures';
import { makeAuditLogEntity } from 'tests/helpers/audit/auditLog.fixtures';
import { makeMemory } from 'tests/helpers/chat/userMemory.fixtures';
import { makeMessageFeedback } from 'tests/helpers/chat/messageFeedback.fixtures';
import { makeMessageReport } from 'tests/helpers/chat/messageReport.fixtures';
import {
  makeExportUserDataUseCase,
  runExport,
  type ExportWiring,
} from 'tests/helpers/auth/erasure-chain.accessor';

const SECRET_KEY_RE = /password|_token|hash|salt|prevHash|rowHash/i;

/** Recursively collects every object key (incl. nested) from a JSON-serializable value. */
function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      collectKeys(v, out);
    }
  }
  return out;
}

function buildWiring(userId: number): ExportWiring {
  const session = {
    id: 'sess-1',
    locale: 'fr-FR',
    museumMode: true,
    intent: 'walk',
    museumId: 5,
    coordinates: { lat: 44.84, lng: -0.57 },
    visitContext: { foo: 'bar' },
    currentRoom: 'room-uuid-1',
    currentArtworkId: 'art-uuid-1',
    title: 'My visit',
    museumName: 'CAPC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    messages: [],
  };

  return {
    chatDataExport: { getAllUserData: async () => ({ sessions: [session] }) },
    reviewDataExport: { listForUser: async () => [] },
    supportDataExport: { listForUser: async () => [] },
    userConsentRepository: { listForUser: async () => [] },
    userMemoryExport: { getForUser: async () => makeMemory({ userId }) },
    auditLogExport: {
      listForUser: async () => [makeAuditLogEntity({ actorId: userId })],
    },
    messageFeedbackExport: {
      listForUser: async () => [makeMessageFeedback({ userId })],
    },
    messageReportExport: {
      listForUser: async () => [makeMessageReport({ userId })],
    },
    socialAccountExport: {
      listForUser: async () => [makeSocialAccount({ userId })],
    },
    apiKeyExport: {
      listForUser: async () => [makeApiKey({ userId })],
    },
  };
}

describe('ExportUserDataUseCase — DSAR completeness (B3 / R12–R14)', () => {
  const user = makeUser({
    id: 42,
    email: 'subject@example.com',
    tier: 'premium',
    defaultLocale: 'fr-FR',
    dateOfBirth: new Date('1990-05-21T00:00:00.000Z'),
    contentPreferences: ['history', 'technique'],
    ttsVoice: 'verse',
    notifyOnReviewModeration: true,
    defaultMuseumMode: false,
    guideLevel: 'expert',
    dataMode: 'normal',
    audioDescriptionMode: true,
    suspended: false,
    museumId: 5,
  });

  it('bumps schemaVersion to "2"', async () => {
    const useCase = makeExportUserDataUseCase(buildWiring(42));
    const payload = await runExport(useCase, user);
    expect(payload.schemaVersion).toBe('2');
  });

  it('includes every new personal-data category (R12)', async () => {
    const useCase = makeExportUserDataUseCase(buildWiring(42));
    const payload = await runExport(useCase, user);

    expect(payload).toHaveProperty('userMemory');
    expect(payload.userMemory).not.toBeNull();

    expect(Array.isArray(payload.auditLogs)).toBe(true);
    expect((payload.auditLogs as unknown[]).length).toBeGreaterThan(0);

    expect(Array.isArray(payload.messageFeedback)).toBe(true);
    expect((payload.messageFeedback as unknown[]).length).toBeGreaterThan(0);

    expect(Array.isArray(payload.messageReports)).toBe(true);
    expect((payload.messageReports as unknown[]).length).toBeGreaterThan(0);

    expect(Array.isArray(payload.socialAccounts)).toBe(true);
    expect((payload.socialAccounts as unknown[]).length).toBeGreaterThan(0);

    expect(Array.isArray(payload.apiKeys)).toBe(true);
    expect((payload.apiKeys as unknown[]).length).toBeGreaterThan(0);
  });

  it('includes the previously-omitted User columns with the entity values (R13)', async () => {
    const useCase = makeExportUserDataUseCase(buildWiring(42));
    const payload = await runExport(useCase, user);
    const userOut = payload.user as Record<string, unknown>;

    expect(userOut.tier).toBe('premium');
    expect(userOut.defaultLocale).toBe('fr-FR');
    expect(userOut.dateOfBirth).toBe('1990-05-21'); // ISO date (no time)
    expect(userOut.contentPreferences).toEqual(['history', 'technique']);
    expect(userOut.ttsVoice).toBe('verse');
    expect(userOut.notifyOnReviewModeration).toBe(true);
    expect(userOut.defaultMuseumMode).toBe(false);
    expect(userOut.guideLevel).toBe('expert');
    expect(userOut.dataMode).toBe('normal');
    expect(userOut.audioDescriptionMode).toBe(true);
    expect(userOut.suspended).toBe(false);
    expect(userOut.museumId).toBe(5);
    // `locale` placeholder replaced by `defaultLocale`.
    expect(userOut).not.toHaveProperty('locale');
  });

  it('includes the previously-omitted ChatSession columns (R13)', async () => {
    const useCase = makeExportUserDataUseCase(buildWiring(42));
    const payload = await runExport(useCase, user);
    const sessions = payload.chatSessions as Record<string, unknown>[];
    expect(sessions.length).toBeGreaterThan(0);
    const s = sessions[0];

    expect(s.intent).toBe('walk');
    expect(s.museumId).toBe(5);
    expect(s.coordinates).toEqual({ lat: 44.84, lng: -0.57 });
    expect(s.visitContext).toEqual({ foo: 'bar' });
    expect(s.currentRoom).toBe('room-uuid-1');
    expect(s.currentArtworkId).toBe('art-uuid-1');
  });

  it('NEVER leaks a secret/credential key anywhere in the serialized payload (R14)', async () => {
    const useCase = makeExportUserDataUseCase(buildWiring(42));
    const payload = await runExport(useCase, user);

    // Round-trip through JSON so getters / class instances are flattened.
    const serialized = JSON.parse(JSON.stringify(payload)) as unknown;
    const keys = collectKeys(serialized);
    const offending = keys.filter((k) => SECRET_KEY_RE.test(k));
    expect(offending).toEqual([]);

    // Belt-and-braces: the seeded api-key secrets must not appear as VALUES.
    const blob = JSON.stringify(serialized);
    expect(blob).not.toContain('SECRET_HASH_DO_NOT_EXPORT');
    expect(blob).not.toContain('SECRET_SALT_DO_NOT_EXPORT');
  });
});
