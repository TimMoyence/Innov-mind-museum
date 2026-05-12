import {
  GetMessageExplanationUseCase,
  MessageNotFoundForExplanationError,
  type ExplanationAuditCorrelator,
  type ExplanationChatRepository,
} from '@modules/chat/useCase/explanation/get-message-explanation.use-case';
import { makeMessage, makeSession, makeSessionUser } from 'tests/helpers/chat/message.fixtures';

import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

// ─────────────────────────────────────────────────────────────────────────────
// Test doubles
// ─────────────────────────────────────────────────────────────────────────────

function makeRepository(returnValue: { message: ChatMessage; session: ChatSession } | null): {
  repository: ExplanationChatRepository;
  getMessageById: jest.Mock;
} {
  const getMessageById = jest.fn().mockResolvedValue(returnValue);
  return { repository: { getMessageById }, getMessageById };
}

function makeCorrelator(auditRef: string | null): {
  correlator: ExplanationAuditCorrelator;
  findCorrelatedAuditRef: jest.Mock;
} {
  const findCorrelatedAuditRef = jest.fn().mockResolvedValue(auditRef);
  return { correlator: { findCorrelatedAuditRef }, findCorrelatedAuditRef };
}

const decisionAt = new Date('2026-05-12T14:23:00Z');

function buildAssistantBlockedMessage(metadata: Record<string, unknown>): ChatMessage {
  const session = makeSession({ user: makeSessionUser(42) });
  return makeMessage({
    id: 'msg-blocked-001',
    role: 'assistant',
    session,
    sessionId: session.id,
    text: 'Refusal text',
    metadata,
    createdAt: decisionAt,
  });
}

function buildAssistantAllowedMessage(): ChatMessage {
  const session = makeSession({ user: makeSessionUser(42) });
  return makeMessage({
    id: 'msg-allowed-001',
    role: 'assistant',
    session,
    sessionId: session.id,
    text: 'Normal answer about Monet.',
    metadata: null,
    createdAt: decisionAt,
  });
}

function buildUserMessage(): ChatMessage {
  const session = makeSession({ user: makeSessionUser(42) });
  return makeMessage({
    id: 'msg-user-001',
    role: 'user',
    session,
    sessionId: session.id,
    text: 'Tell me about Monet',
    metadata: null,
    createdAt: decisionAt,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GetMessageExplanationUseCase', () => {
  it('returns the localised blocked explanation when message metadata flags a guardrail block', async () => {
    const message = buildAssistantBlockedMessage({
      blocked: true,
      guardrailReason: 'off_topic',
      policyVersion: 'p1-2026-05',
    });
    const { repository } = makeRepository({ message, session: message.session });
    const { correlator, findCorrelatedAuditRef } = makeCorrelator('audit-uuid-001');

    const useCase = new GetMessageExplanationUseCase({
      repository,
      auditCorrelator: correlator,
    });

    const result = await useCase.execute({
      messageId: message.id,
      userId: 42,
      locale: 'fr',
    });

    expect(result.decision).toBe('blocked');
    expect(result.category).toBe('off_topic');
    expect(result.policyVersion).toBe('p1-2026-05');
    expect(result.decisionAt).toBe(decisionAt.toISOString());
    expect(result.reasonSummary).toMatch(/Musaium/);
    expect(result.recourse.type).toBe('self-retry');
    expect(result.recourse.supportUrl).toBeNull();
    expect(result.auditRef).toBe('audit-uuid-001');
    expect(findCorrelatedAuditRef).toHaveBeenCalledWith({
      userId: 42,
      sessionId: message.session.id,
      decisionAt,
    });
  });

  it('returns the localised allowed explanation when no block flag is present in metadata', async () => {
    const message = buildAssistantAllowedMessage();
    const { repository } = makeRepository({ message, session: message.session });
    const { correlator, findCorrelatedAuditRef } = makeCorrelator(null);

    const useCase = new GetMessageExplanationUseCase({
      repository,
      auditCorrelator: correlator,
    });

    const result = await useCase.execute({
      messageId: message.id,
      userId: 42,
      locale: 'en',
    });

    expect(result.decision).toBe('allowed');
    expect(result.category).toBeNull();
    expect(result.recourse.type).toBe('signal');
    expect(result.policyVersion).toBe('default-v0');
    expect(result.auditRef).toBeNull();
    expect(findCorrelatedAuditRef).not.toHaveBeenCalled();
  });

  it('throws MessageNotFoundForExplanationError (mapped to 404) when the message belongs to another user', async () => {
    const message = buildAssistantBlockedMessage({ blocked: true, guardrailReason: 'pii' });
    const { repository } = makeRepository({ message, session: message.session });
    const useCase = new GetMessageExplanationUseCase({ repository });

    await expect(
      useCase.execute({ messageId: message.id, userId: 999, locale: 'en' }),
    ).rejects.toBeInstanceOf(MessageNotFoundForExplanationError);
  });

  it('throws MessageNotFoundForExplanationError when the message id does not exist', async () => {
    const { repository } = makeRepository(null);
    const useCase = new GetMessageExplanationUseCase({ repository });

    await expect(
      useCase.execute({ messageId: 'unknown-id', userId: 42, locale: 'en' }),
    ).rejects.toBeInstanceOf(MessageNotFoundForExplanationError);
  });

  it('returns the user-message stub explanation when the message role is "user"', async () => {
    const message = buildUserMessage();
    const { repository } = makeRepository({ message, session: message.session });
    const { correlator, findCorrelatedAuditRef } = makeCorrelator('audit-should-not-be-queried');

    const useCase = new GetMessageExplanationUseCase({
      repository,
      auditCorrelator: correlator,
    });

    const result = await useCase.execute({
      messageId: message.id,
      userId: 42,
      locale: 'en',
    });

    expect(result.decision).toBe('allowed');
    expect(result.category).toBeNull();
    expect(result.auditRef).toBeNull();
    expect(findCorrelatedAuditRef).not.toHaveBeenCalled();
  });

  it('correlates an audit ref via the injected correlator on blocked decisions', async () => {
    const message = buildAssistantBlockedMessage({
      blocked: true,
      guardrailReason: 'prompt_injection',
    });
    const { repository } = makeRepository({ message, session: message.session });
    const { correlator, findCorrelatedAuditRef } = makeCorrelator('audit-correlated-uuid');

    const useCase = new GetMessageExplanationUseCase({
      repository,
      auditCorrelator: correlator,
    });

    const result = await useCase.execute({ messageId: message.id, userId: 42, locale: 'en' });

    expect(result.auditRef).toBe('audit-correlated-uuid');
    expect(findCorrelatedAuditRef).toHaveBeenCalledTimes(1);
  });

  it('returns auditRef=null when the correlator finds no matching row', async () => {
    const message = buildAssistantBlockedMessage({
      blocked: true,
      guardrailReason: 'unsafe_output',
    });
    const { repository } = makeRepository({ message, session: message.session });
    const { correlator } = makeCorrelator(null);

    const useCase = new GetMessageExplanationUseCase({
      repository,
      auditCorrelator: correlator,
    });

    const result = await useCase.execute({ messageId: message.id, userId: 42, locale: 'en' });

    expect(result.auditRef).toBeNull();
    expect(result.category).toBe('unsafe_output');
  });

  it('degrades to auditRef=null when the correlator throws', async () => {
    const message = buildAssistantBlockedMessage({ blocked: true, guardrailReason: 'off_topic' });
    const { repository } = makeRepository({ message, session: message.session });
    const correlator: ExplanationAuditCorrelator = {
      findCorrelatedAuditRef: jest.fn().mockRejectedValue(new Error('db down')),
    };

    const useCase = new GetMessageExplanationUseCase({ repository, auditCorrelator: correlator });
    const result = await useCase.execute({ messageId: message.id, userId: 42, locale: 'en' });

    expect(result.auditRef).toBeNull();
    expect(result.decision).toBe('blocked');
  });

  it('extracts providedBy from message metadata when present', async () => {
    const message = buildAssistantBlockedMessage({
      blocked: true,
      guardrailReason: 'prompt_injection',
      providedBy: { name: 'llm-guard', version: '0.3.16' },
    });
    const { repository } = makeRepository({ message, session: message.session });
    const useCase = new GetMessageExplanationUseCase({ repository });

    const result = await useCase.execute({ messageId: message.id, userId: 42, locale: 'en' });

    expect(result.providedBy).toEqual({ name: 'llm-guard', version: '0.3.16' });
  });

  it('ignores malformed providedBy stamps in metadata (returns null)', async () => {
    const message = buildAssistantBlockedMessage({
      blocked: true,
      guardrailReason: 'pii',
      providedBy: { name: 'llm-guard' },
    });
    const { repository } = makeRepository({ message, session: message.session });
    const useCase = new GetMessageExplanationUseCase({ repository });

    const result = await useCase.execute({ messageId: message.id, userId: 42, locale: 'en' });

    expect(result.providedBy).toBeNull();
  });

  it('falls back to English explanations when an unsupported locale is requested', async () => {
    const message = buildAssistantBlockedMessage({ blocked: true, guardrailReason: 'off_topic' });
    const { repository } = makeRepository({ message, session: message.session });
    const useCase = new GetMessageExplanationUseCase({ repository });

    const resultUnknown = await useCase.execute({
      messageId: message.id,
      userId: 42,
      locale: 'xx-Latn',
    });
    const resultEn = await useCase.execute({
      messageId: message.id,
      userId: 42,
      locale: 'en',
    });

    expect(resultUnknown.reasonSummary).toBe(resultEn.reasonSummary);
  });

  it('falls back to policyVersion="default-v0" when metadata does not stamp a version', async () => {
    const message = buildAssistantBlockedMessage({ blocked: true, guardrailReason: 'off_topic' });
    const { repository } = makeRepository({ message, session: message.session });
    const useCase = new GetMessageExplanationUseCase({ repository });

    const result = await useCase.execute({ messageId: message.id, userId: 42, locale: 'en' });

    expect(result.policyVersion).toBe('default-v0');
  });

  it('maps an "unknown" block reason to the generic unknown category + support recourse', async () => {
    const message = buildAssistantBlockedMessage({
      blocked: true,
      guardrailReason: 'mystery_class',
    });
    const { repository } = makeRepository({ message, session: message.session });
    const useCase = new GetMessageExplanationUseCase({
      repository,
      supportUrl: 'https://support.example.test/explain',
    });

    const result = await useCase.execute({ messageId: message.id, userId: 42, locale: 'en' });

    expect(result.category).toBeNull();
    expect(result.recourse.type).toBe('support');
    expect(result.recourse.supportUrl).toBe('https://support.example.test/explain');
  });

  it('honours the explicit metadata.blocked=false flag even when a stale guardrailReason is present', async () => {
    const message = buildAssistantBlockedMessage({
      blocked: false,
      guardrailReason: 'off_topic',
    });
    const { repository } = makeRepository({ message, session: message.session });
    const useCase = new GetMessageExplanationUseCase({ repository });

    const result = await useCase.execute({ messageId: message.id, userId: 42, locale: 'en' });

    expect(result.decision).toBe('allowed');
    expect(result.category).toBeNull();
  });
});
