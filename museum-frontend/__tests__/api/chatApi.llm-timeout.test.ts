/**
 * LLM-backed chat calls need their OWN timeout.
 *
 * `httpClient` defaults every request to 15s (shared/infrastructure/httpClient.ts).
 * That is a sane ceiling for CRUD, and far too tight for anything that waits on a
 * model: the voice round-trip is STT → LLM → TTS. Measured against a LOCAL backend
 * on a warm connection, `POST /api/chat/sessions/:id/audio` took **14.1s** — 0.9s
 * of headroom. On a real network, or with the model a little slow (the backend
 * already logs `llm_section_timeout` at 8s with retries), axios aborts the request
 * with ECONNABORTED and the user's voice message is simply lost.
 *
 * These calls are also the ones a retry helps least: re-sending a 14s multipart
 * upload to re-run the same slow model just burns another 14s (and another token
 * bill). The fix is to stop pretending they are CRUD.
 *
 * Caught by `audio-recording-flow.yaml`: the transcript rendered a beat AFTER the
 * assertion window — the screenshot at failure showed the bubble on screen.
 */

import '@/__tests__/helpers/test-utils';

const mockHttpRequest = jest.fn();

// Spy on `httpRequest` but keep the rest of the module REAL — a blanket factory
// would also stub out `LLM_REQUEST_TIMEOUT_MS`, and every assertion below would
// then compare `undefined` to `undefined` and pass while proving nothing.
jest.mock('@/shared/api/httpRequest', () => ({
  ...jest.requireActual('@/shared/api/httpRequest'),
  httpRequest: (...args: unknown[]) => mockHttpRequest(...args),
}));

jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  authStorage: {},
  getAccessToken: () => '',
  setAccessToken: jest.fn(),
  clearAccessToken: jest.fn(),
  purgeStaleCredentialsOnFreshInstall: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/shared/infrastructure/httpClient', () => ({
  httpClient: { request: jest.fn() },
  mapAxiosError: (e: unknown) => e,
}));

import { chatApi } from '@/features/chat/infrastructure/chatApi';
import { LLM_REQUEST_TIMEOUT_MS } from '@/shared/api/httpRequest';
import { makePostMessageResponse } from '@/__tests__/helpers/factories';

/** The CRUD default every other call inherits (httpClient.ts). */
const CRUD_TIMEOUT_MS = 15_000;

/** Read the RequestOptions the API layer handed to httpRequest. */
const optionsOfLastCall = (): { timeoutMs?: number } =>
  (mockHttpRequest.mock.calls.at(-1)?.[1] ?? {}) as { timeoutMs?: number };

describe('chat calls that wait on a model carry their own timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHttpRequest.mockResolvedValue(makePostMessageResponse());
  });

  it('gives the LLM budget real headroom over the CRUD default', () => {
    // The measured worst case is already 14.1s on localhost. Anything at or below
    // the CRUD ceiling would be a rounding error away from cutting users off.
    expect(LLM_REQUEST_TIMEOUT_MS).toBeGreaterThan(CRUD_TIMEOUT_MS * 2);
  });

  it('postAudioMessage — the STT → LLM → TTS round-trip, the slowest call in the app', async () => {
    await chatApi.postAudioMessage({
      sessionId: 'session-1',
      audioUri: 'file:///tmp/voice.m4a',
    });

    // `toBe(CONST)` alone would pass VACUOUSLY while both sides are undefined —
    // the exact failure mode this whole night has been about. Pin the number too.
    expect(optionsOfLastCall().timeoutMs).toBeGreaterThan(CRUD_TIMEOUT_MS);
    expect(optionsOfLastCall().timeoutMs).toBe(LLM_REQUEST_TIMEOUT_MS);
  });

  it('postMessage — a text turn still waits on the full model response', async () => {
    await chatApi.postMessage({
      sessionId: 'session-1',
      text: 'Who painted the Mona Lisa?',
    });

    // `toBe(CONST)` alone would pass VACUOUSLY while both sides are undefined —
    // the exact failure mode this whole night has been about. Pin the number too.
    expect(optionsOfLastCall().timeoutMs).toBeGreaterThan(CRUD_TIMEOUT_MS);
    expect(optionsOfLastCall().timeoutMs).toBe(LLM_REQUEST_TIMEOUT_MS);
  });

  it('postMessage with an image — vision adds an upload on top of the model wait', async () => {
    // There is no separate image endpoint: `postMessage` switches to multipart when
    // given an imageUri, so the vision turn rides the same call.
    await chatApi.postMessage({
      sessionId: 'session-1',
      imageUri: 'file:///tmp/artwork.jpg',
    });

    // `toBe(CONST)` alone would pass VACUOUSLY while both sides are undefined —
    // the exact failure mode this whole night has been about. Pin the number too.
    expect(optionsOfLastCall().timeoutMs).toBeGreaterThan(CRUD_TIMEOUT_MS);
    expect(optionsOfLastCall().timeoutMs).toBe(LLM_REQUEST_TIMEOUT_MS);
  });

  it('synthesizeSpeech — TTS renders the whole answer before returning a byte', async () => {
    mockHttpRequest.mockResolvedValue(new ArrayBuffer(8));

    await chatApi.synthesizeSpeech('message-1');

    expect(optionsOfLastCall().timeoutMs).toBeGreaterThan(CRUD_TIMEOUT_MS);
    expect(optionsOfLastCall().timeoutMs).toBe(LLM_REQUEST_TIMEOUT_MS);
  });
});
