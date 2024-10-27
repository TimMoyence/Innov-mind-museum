import { museumArtIAUseCase } from '../../../../../src/modules/IA/museum/core/useCase';

describe('Test moderation By IA', () => {
  it('should be respond something', async () => {
    const artName = 'Vénus de Milo';
    const artist = "Alexandros d'Antioche";
    const responseTon = 'avec un ton de pirate';
    const response = await museumArtIAUseCase.askQuestionOnArtToIA(
      artName,
      artist,
      responseTon,
    );
    expect(response).toEqual(response);
  }, 15000);
});
