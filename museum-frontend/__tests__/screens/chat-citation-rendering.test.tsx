/**
 * Red tests for A6 — bubble integration of `<CitationChips>`.
 *
 * Asserts that an assistant message with `metadata.sources` populated renders
 * the chip cluster bottom-of-bubble per A6 §1.1 R1 + §4 AC14 :
 *
 *   1. Assistant non-streaming message → `<CitationChips>` is rendered exactly
 *      once inside `<ChatMessageBubble>`.
 *   2. User message → `<CitationChips>` NOT rendered (R5).
 *   3. Streaming assistant message → `<CitationChips>` NOT rendered (R1 — only
 *      when isStreaming === false).
 *
 * At baseline (A6 not yet implemented) :
 *   - `<CitationChips>` is never imported by `<ChatMessageBubble>` — the
 *     `jest.mock` factory below registers a spy mock, but the spy is never
 *     invoked because the component is not (yet) in the bubble's JSX.
 *   - Therefore `expect(mockCitationChips).toHaveBeenCalled()` fails.
 *
 * Why a dedicated file (not merged into chat-session-deep) :
 *   - chat-session-deep is already 1k+ lines with global mocks tuned to its
 *     own assertions ; mixing A6 mocks risks side-effects.
 *   - Independent green/red lifecycle (A6 is a leaf feature on the bubble).
 *
 * Spec: `docs/chat-ux-refonte/specs/A6.md` §1.1 R1, R5 ; §4 AC14.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { makeAssistantMessage, makeCitationSource } from '../helpers/factories';
import { makeChatUiMessage } from '../helpers/factories/chat.factories';

// ── Mock CitationChips so we can spy on its render contract ────────────────
// RED ASSERTION : the module @/features/chat/ui/CitationChips does NOT exist
// at baseline — Jest's mock factory below will still be resolved by the
// jest.mock hoist (factory is a plain function, evaluated lazily), but the
// import inside ChatMessageBubble does NOT exist at baseline either, so the
// component never imports + renders the mock. Two failure modes :
//   (a) If the import path doesn't exist at all, jest.mock still succeeds
//       silently (the moduleNameMapper auto-creates a virtual module for the
//       mock factory). The assertions still fail because the bubble never
//       imports it.
//   (b) Once T2.2 lands the real CitationChips, the mock takes precedence
//       (jest.mock hoists before any import) and the spy will fire — the
//       red→green transition flips the assertions.
const mockCitationChips = jest.fn();
jest.mock(
  '@/features/chat/ui/CitationChips',
  () => {
    const RN = require('react-native');
    const ReactNS = require('react');
    return {
      CitationChips: (props: Record<string, unknown>) => {
        mockCitationChips(props);
        return ReactNS.createElement(RN.View, { testID: 'mock-CitationChips' });
      },
    };
  },
  { virtual: true },
);

// Import AFTER mock declarations. ChatMessageBubble is the SUT here.
import { ChatMessageBubble } from '@/features/chat/ui/ChatMessageBubble';

describe('ChatMessageBubble — A6 CitationChips integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders <CitationChips> for an assistant non-streaming message with sources (R1)', () => {
    const message = makeAssistantMessage(
      { text: 'The Mona Lisa was painted by Leonardo da Vinci between 1503 and 1519.' },
      {
        sources: [
          makeCitationSource({ type: 'museum-catalog' }),
          makeCitationSource({ type: 'wikidata' }),
        ],
      },
    );

    render(
      <ChatMessageBubble
        message={message}
        locale="en-US"
        isStreaming={false}
        onImageError={jest.fn()}
        onReport={jest.fn()}
      />,
    );

    expect(mockCitationChips).toHaveBeenCalled();
    const lastCallProps = mockCitationChips.mock.calls.at(-1)?.[0] as {
      metadata?: { sources?: unknown };
    };
    expect(lastCallProps?.metadata?.sources).toBeDefined();
  });

  it('renders <CitationChips> for an assistant non-streaming message WITHOUT sources (R4 — AI-only chip)', () => {
    const message = makeAssistantMessage(
      { text: 'Impressionism is an art movement that emerged in 19th-century France.' },
      // No sources field → R4 path : AI-knowledge chip rendered.
    );
    // Strip out factory-defaulted sources to simulate the AI-only case.
    const messageWithNoSources = {
      ...message,
      metadata: message.metadata ? { ...message.metadata, sources: undefined } : message.metadata,
    };

    render(
      <ChatMessageBubble
        message={messageWithNoSources}
        locale="en-US"
        isStreaming={false}
        onImageError={jest.fn()}
        onReport={jest.fn()}
      />,
    );

    expect(mockCitationChips).toHaveBeenCalled();
  });

  it('does NOT render <CitationChips> for a user message (R5)', () => {
    const userMessage = makeChatUiMessage({ role: 'user', text: 'What is this painting?' });

    render(
      <ChatMessageBubble
        message={userMessage}
        locale="en-US"
        isStreaming={false}
        onImageError={jest.fn()}
        onReport={jest.fn()}
      />,
    );

    expect(mockCitationChips).not.toHaveBeenCalled();
  });

  it('does NOT render <CitationChips> for a streaming assistant message (R1 isStreaming===false guard)', () => {
    const streamingMessage = makeAssistantMessage({
      text: 'The Mona Lisa…',
    });

    render(
      <ChatMessageBubble
        message={streamingMessage}
        locale="en-US"
        isStreaming
        onImageError={jest.fn()}
        onReport={jest.fn()}
      />,
    );

    expect(mockCitationChips).not.toHaveBeenCalled();
  });
});
