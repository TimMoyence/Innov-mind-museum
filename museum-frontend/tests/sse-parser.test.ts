/* eslint-disable @typescript-eslint/no-deprecated -- this file tests the deprecated SSE parser (retained for residual client compat, ADR-001) */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import { parseSseChunk } from '../features/chat/infrastructure/sseParser';

describe('parseSseChunk', () => {
  it('parses a single token event', () => {
    const buffer = 'event: token\ndata: {"t":"Hello "}\n\n';
    const { events, remainder } = parseSseChunk(buffer);

    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0], { type: 'token', text: 'Hello ' });
    assert.strictEqual(remainder, '');
  });

  it('parses multiple events in one buffer', () => {
    const buffer =
      'event: token\ndata: {"t":"Hello "}\n\n' +
      'event: token\ndata: {"t":"world"}\n\n' +
      'event: done\ndata: {"messageId":"m1","createdAt":"2026-01-01T00:00:00Z","metadata":{}}\n\n';

    const { events, remainder } = parseSseChunk(buffer);

    assert.strictEqual(events.length, 3);
    assert.deepStrictEqual(events[0], { type: 'token', text: 'Hello ' });
    assert.deepStrictEqual(events[1], { type: 'token', text: 'world' });
    assert.deepStrictEqual(events[2], {
      type: 'done',
      messageId: 'm1',
      createdAt: '2026-01-01T00:00:00Z',
      metadata: {},
    });
    assert.strictEqual(remainder, '');
  });

  it('returns remainder for incomplete event (no trailing \\n\\n)', () => {
    const buffer = 'event: token\ndata: {"t":"partial"}';
    const { events, remainder } = parseSseChunk(buffer);

    assert.strictEqual(events.length, 0);
    assert.strictEqual(remainder, 'event: token\ndata: {"t":"partial"}');
  });

  it('parses done event with metadata', () => {
    const buffer =
      'event: done\ndata: {"messageId":"abc-123","createdAt":"2026-03-19T12:00:00Z","metadata":{"model":"gpt-4","tokens":42}}\n\n';

    const { events, remainder } = parseSseChunk(buffer);

    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0], {
      type: 'done',
      messageId: 'abc-123',
      createdAt: '2026-03-19T12:00:00Z',
      metadata: { model: 'gpt-4', tokens: 42 },
    });
    assert.strictEqual(remainder, '');
  });

  it('parses error event', () => {
    const buffer = 'event: error\ndata: {"code":"RATE_LIMIT","message":"Too many requests"}\n\n';

    const { events, remainder } = parseSseChunk(buffer);

    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0], {
      type: 'error',
      code: 'RATE_LIMIT',
      message: 'Too many requests',
    });
    assert.strictEqual(remainder, '');
  });

  it('parses guardrail event', () => {
    const buffer =
      'event: guardrail\ndata: {"text":"I can only help with art-related topics.","reason":"off_topic"}\n\n';

    const { events, remainder } = parseSseChunk(buffer);

    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0], {
      type: 'guardrail',
      text: 'I can only help with art-related topics.',
      reason: 'off_topic',
    });
    assert.strictEqual(remainder, '');
  });

  it('skips malformed JSON data lines', () => {
    const buffer =
      'event: token\ndata: {not valid json}\n\n' + 'event: token\ndata: {"t":"valid"}\n\n';

    const { events, remainder } = parseSseChunk(buffer);

    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0], { type: 'token', text: 'valid' });
    assert.strictEqual(remainder, '');
  });

  it('handles empty and whitespace-only blocks', () => {
    const buffer = '\n\n   \n\n\n\nevent: token\ndata: {"t":"ok"}\n\n';

    const { events, remainder } = parseSseChunk(buffer);

    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0], { type: 'token', text: 'ok' });
    assert.strictEqual(remainder, '');
  });

  it('handles all 4 event types in sequence', () => {
    const buffer =
      'event: token\ndata: {"t":"Mona Lisa"}\n\n' +
      'event: guardrail\ndata: {"text":"Blocked.","reason":"insult"}\n\n' +
      'event: error\ndata: {"code":"INTERNAL","message":"LLM timeout"}\n\n' +
      'event: done\ndata: {"messageId":"z9","createdAt":"2026-03-19T08:30:00Z","metadata":{"latencyMs":120}}\n\n';

    const { events, remainder } = parseSseChunk(buffer);

    assert.strictEqual(events.length, 4);
    assert.deepStrictEqual(events[0], { type: 'token', text: 'Mona Lisa' });
    assert.deepStrictEqual(events[1], {
      type: 'guardrail',
      text: 'Blocked.',
      reason: 'insult',
    });
    assert.deepStrictEqual(events[2], {
      type: 'error',
      code: 'INTERNAL',
      message: 'LLM timeout',
    });
    assert.deepStrictEqual(events[3], {
      type: 'done',
      messageId: 'z9',
      createdAt: '2026-03-19T08:30:00Z',
      metadata: { latencyMs: 120 },
    });
    assert.strictEqual(remainder, '');
  });
});
