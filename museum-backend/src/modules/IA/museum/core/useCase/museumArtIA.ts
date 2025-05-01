import { IAMuseumArtInterface } from '../domaine/IAMuseumArt.interface';

export class museumArtIA {
  constructor(private readonly _museumArtIA: IAMuseumArtInterface) {}

  async askQuestionOnArtToIA(
    artName: string,
    artist: string,
    responseTon: string,
  ) {
    return this._museumArtIA.askQuestionOnArtToIA(artName, artist, responseTon);
  }
}
