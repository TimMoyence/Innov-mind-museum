import { isRenderableAssistantContent } from '@/features/chat/application/chatSessionLogic.pure';
import type { ChatUiMessageMetadata } from '@/features/chat/application/chatSessionLogic.pure';
import { makeEnrichedImage } from '@/__tests__/helpers/factories/chat.factories';
import { makeCompareResult } from '@/__tests__/helpers/factories/compare.factories';

// Cycle 5 (UFR-022 RED) — AC-8 / EARS-11.
//
// `isRenderableAssistantContent` is the single pure source of truth for "should
// this assistant response produce a bubble?". Its criterion MUST mirror the
// render condition in `ChatMessageBubble.tsx:97` (`hasImages =
// (metadata?.images?.length ?? 0) > 0`) and `:276` (`metadata?.compareResults`)
// so that logic and pixel never diverge (Décision D7).
//
// The helper does NOT exist yet — every case below fails to import/resolve
// today (absence-of-feature RED, not a frozen-behaviour lock).
describe('isRenderableAssistantContent (helper pur — AC-8)', () => {
  it('returns false for an empty string with no media', () => {
    expect(isRenderableAssistantContent('', null)).toBe(false);
  });

  it('returns false for whitespace-only text with no media', () => {
    expect(isRenderableAssistantContent('   ', null)).toBe(false);
  });

  it('returns false for newline-only text with no media', () => {
    expect(isRenderableAssistantContent('\n', null)).toBe(false);
  });

  it('returns false for null text with no media', () => {
    expect(isRenderableAssistantContent(null, null)).toBe(false);
  });

  it('returns false for undefined text with no media', () => {
    expect(isRenderableAssistantContent(undefined, undefined)).toBe(false);
  });

  it('returns false for empty text with an empty (no-op) metadata object', () => {
    const metadata: ChatUiMessageMetadata = {};
    expect(isRenderableAssistantContent('', metadata)).toBe(false);
  });

  it('returns false for empty text with an empty images array', () => {
    const metadata: ChatUiMessageMetadata = { images: [] };
    expect(isRenderableAssistantContent('', metadata)).toBe(false);
  });

  it('returns true for non-blank text', () => {
    expect(isRenderableAssistantContent('Hello', null)).toBe(true);
  });

  it('returns true for non-blank text even surrounded by whitespace', () => {
    expect(isRenderableAssistantContent('  x  ', null)).toBe(true);
  });

  it('returns true for empty text carrying enriched images (D7 — image-only legitimate)', () => {
    const metadata: ChatUiMessageMetadata = { images: [makeEnrichedImage()] };
    expect(isRenderableAssistantContent('', metadata)).toBe(true);
  });

  it('returns true for empty text carrying compareResults (D7 — compare-only legitimate)', () => {
    const metadata: ChatUiMessageMetadata = { compareResults: makeCompareResult() };
    expect(isRenderableAssistantContent('', metadata)).toBe(true);
  });
});
