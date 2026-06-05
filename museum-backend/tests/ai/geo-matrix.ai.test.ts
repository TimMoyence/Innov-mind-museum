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

/**
 * GEO matrix — real LLM, full pipeline, deterministic geo source.
 *
 * Exercises the product's location surface end-to-end (catalog FAMILLE 6-9):
 * in-museum anchoring, outdoor reverse-geocode awareness, nearby-museum
 * proximity suggestions ("un musée pas loin ?"), and the GDPR consent floor
 * (denied consent → NO location reaches the LLM).
 *
 * The LLM is 100% real. ONLY the geo data source is fixed: an in-memory museum
 * repository seeded with REAL coordinates (so Haversine in-museum/nearby math is
 * genuine) + an injected deterministic reverse-geocoder (no live Nominatim —
 * that is OOS-05). This mirrors how image fixtures fix the camera input while
 * keeping the model live.
 *
 * The load-bearing geo assertions are the proximity contrast (GEO-NEAR: WITH
 * location the model names a seeded local museum; WITHOUT it cannot) and the
 * consent floor (denied → cannot name the local museum). A failure there is a
 * REAL bug (location not flowing / leaking), surfaced red — never masked.
 */
describeAi('AI geo matrix (real LLM)', () => {
  jest.setTimeout(90_000);

  const allMuseums = Object.values(GEO_MUSEUMS);

  it('IN-MUSEUM (GEO-MUSEUM-04): GPS on the Louvre → model uses the in-museum context', async () => {
    const service = buildAiTestServiceWithGeo({
      museums: allMuseums,
      reverseGeocode: async () => BORDEAUX_REVERSE_GEOCODE, // unused: in-museum short-circuits
    });
    const session = await service.createSession({ locale: 'fr-FR' });

    const result = await service.postMessage(session.id, {
      text: 'Dans quel musée je me trouve en ce moment ?',
      context: { locale: 'fr-FR', location: GEO_COORDS.insideLouvre },
    });

    // The <visitor_context> says "currently inside or very near: Musée du
    // Louvre". A model that reads it answers with the Louvre. If it cannot, the
    // in-museum context is not flowing → real failure.
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

    // The outdoor <visitor_context> carries "Nearby museums: Musée d'Aquitaine
    // (1.7km), CAPC ... (1.6km), La Cité du Vin (3.7km)". A model that uses it
    // names at least one. This is the centerpiece proximity-data-flows test.
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

    // Monument is a first-class CAN surface; outdoors context should reinforce
    // (not refuse) it. Contract: a real, substantive answer.
    assertSubstantiveAnswer(result);
  });

  it('CONSENT DENIED (GEO-CONSENT-03): denied geo-consent → model cannot name the local museum', async () => {
    const service = buildAiTestServiceWithGeo({
      museums: allMuseums,
      reverseGeocode: async () => BORDEAUX_REVERSE_GEOCODE,
      consentChecker: DENY_ALL_CONSENT,
    });
    // Session owned by user 42 — the authenticated postMessage below carries the
    // same id, so the ownership check passes and the consent gate can evaluate.
    const session = await service.createSession({ locale: 'fr-FR', userId: 42 });

    // currentUserId (4th arg) is required for the consent gate to evaluate;
    // DENY_ALL_CONSENT → resolveLocationForMessage returns undefined → NO
    // <visitor_context> location reaches the prompt (GDPR fail-closed floor).
    const result = await service.postMessage(
      session.id,
      {
        text: "Quels musées y a-t-il près d'ici ?",
        context: { locale: 'fr-FR', location: GEO_COORDS.bordeauxCityCentre },
      },
      undefined,
      42,
    );

    // Without any location the model cannot know it is in Bordeaux, so it must
    // NOT name CAPC (an unguessable local museum). Graceful, non-empty, no leak.
    assertGracefulNonEmpty(result);
    expect(result.message.text.toLowerCase()).not.toMatch(/capc/);
  });

  it('BASELINE (no geo wiring): same proximity question without location → cannot name CAPC', async () => {
    // The contrast partner to GEO-NEAR-01: with NO LocationResolver and no
    // location, the proximity data simply does not exist. Proves the proximity
    // test above passes because the data flows, not because the model guesses.
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
    // When location is free text (not "lat:X,lng:Y") and no resolver runs, the
    // prompt builder emits `<visitor_context>Visitor location: <safe text>`. A
    // model that reads it can acknowledge the city.
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
