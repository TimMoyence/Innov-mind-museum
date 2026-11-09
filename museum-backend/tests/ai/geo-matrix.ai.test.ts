import {
  shouldRunAiTests,
  buildAiTestService,
  buildAiTestServiceWithGeo,
  assertSubstantiveAnswer,
  assertGracefulNonEmpty,
  readFixtureDataUrl,
  AI_IMAGE_FIXTURES,
  GEO_MUSEUMS,
  GEO_COORDS,
  BORDEAUX_REVERSE_GEOCODE,
  DENY_ALL_CONSENT,
} from './setup/ai-test-helpers';

const describeAi = shouldRunAiTests ? describe : describe.skip;

describeAi('AI geo matrix (real LLM)', () => {
  jest.setTimeout(90_000);

  const allMuseums = Object.values(GEO_MUSEUMS);

  it('IN-MUSEUM (GEO-MUSEUM-04): GPS on the Louvre → model uses the in-museum context', async () => {
    const service = buildAiTestServiceWithGeo({
      museums: allMuseums,
      reverseGeocode: async () => BORDEAUX_REVERSE_GEOCODE,
    });
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: 'Dans quel musée je me trouve en ce moment ?',
      context: { locale: 'fr-FR', location: GEO_COORDS.insideLouvre },
    });

    assertSubstantiveAnswer(result);
    expect(result.message.text.toLowerCase()).toMatch(/louvre/);
  });

  it('PROXIMITY (GEO-NEAR-01): "un musée pas loin ?" in Bordeaux → names a seeded nearby museum', async () => {
    const service = buildAiTestServiceWithGeo({
      museums: allMuseums,
      reverseGeocode: async () => BORDEAUX_REVERSE_GEOCODE,
    });
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: "Y a-t-il un musée intéressant pas loin d'ici ?",
      context: { locale: 'fr-FR', location: GEO_COORDS.bordeauxCityCentre },
    });

    assertSubstantiveAnswer(result);
    expect(result.message.text.toLowerCase()).toMatch(/aquitaine|capc|cit[ée] du vin/);
  });

  it('OUTDOORS (GEO-CITY-03): monument photo + Bordeaux GPS → grounded architectural answer', async () => {
    const service = buildAiTestServiceWithGeo({
      museums: allMuseums,
      reverseGeocode: async () => BORDEAUX_REVERSE_GEOCODE,
    });
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: 'Parle-moi de ce monument et du quartier où je me trouve.',
      image: { source: 'base64', value: readFixtureDataUrl(AI_IMAGE_FIXTURES.monument) },
      context: { locale: 'fr-FR', location: GEO_COORDS.bordeauxCityCentre },
    });

    assertSubstantiveAnswer(result);
  });

  it('CONSENT DENIED (GEO-CONSENT-03): denied geo-consent → model cannot name the local museum', async () => {
    const service = buildAiTestServiceWithGeo({
      museums: allMuseums,
      reverseGeocode: async () => BORDEAUX_REVERSE_GEOCODE,
      consentChecker: DENY_ALL_CONSENT,
    });
    const session = await service.createSession({ locale: 'fr-FR', userId: 42 });

    const result = await service.postMessage(
      session.id,
      {
        text: "Quels musées y a-t-il près d'ici ?",
        context: { locale: 'fr-FR', location: GEO_COORDS.bordeauxCityCentre },
      },
      undefined,
      42,
    );

    assertGracefulNonEmpty(result);
    expect(result.message.text.toLowerCase()).not.toMatch(/capc/);
  });

  it('BASELINE (no geo wiring): same proximity question without location → cannot name CAPC', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: "Quels musées y a-t-il près d'ici ?",
      context: { locale: 'fr-FR' },
    });

    assertGracefulNonEmpty(result);
    expect(result.message.text.toLowerCase()).not.toMatch(/capc/);
  });

  it('FREE-TEXT LOCATION (GEO-CITY-02): non-GPS location string flows to the model', async () => {
    const service = buildAiTestService();
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: 'Quel patrimoine culturel puis-je découvrir autour de moi ?',
      context: { locale: 'fr-FR', location: 'Bordeaux, France' },
    });

    assertSubstantiveAnswer(result);
    expect(result.message.text.toLowerCase()).toMatch(/bordeaux/);
  });
});
