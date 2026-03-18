import {
  shouldRunAiTests,
  buildAiTestService,
  assertArtResponse,
  TEST_IMAGE_BASE64,
} from './setup/ai-test-helpers';

const describeAi = shouldRunAiTests ? describe : describe.skip;

describeAi('AI vision (real LLM)', () => {
  jest.setTimeout(30_000);

  it('processes an image with a text question', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'What do you see in this image?',
      image: {
        source: 'base64',
        value: `data:image/png;base64,${TEST_IMAGE_BASE64}`,
      },
      context: { locale: 'en-US' },
    });

    assertArtResponse(result.message.text);
  });

  it('processes an image without text (analyze-only)', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      image: {
        source: 'base64',
        value: `data:image/png;base64,${TEST_IMAGE_BASE64}`,
      },
      context: { locale: 'en-US' },
    });

    assertArtResponse(result.message.text);
  });

  it('processes an uploaded image with mimeType', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Describe the colors in this image',
      image: {
        source: 'upload',
        value: TEST_IMAGE_BASE64,
        mimeType: 'image/png',
        sizeBytes: Buffer.from(TEST_IMAGE_BASE64, 'base64').byteLength,
      },
      context: { locale: 'en-US' },
    });

    assertArtResponse(result.message.text);
  });

  it('responds in French when locale is fr-FR with image', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: 'Decrivez cette image',
      image: {
        source: 'base64',
        value: `data:image/png;base64,${TEST_IMAGE_BASE64}`,
      },
      context: { locale: 'fr-FR' },
    });

    assertArtResponse(result.message.text);
  });
});
