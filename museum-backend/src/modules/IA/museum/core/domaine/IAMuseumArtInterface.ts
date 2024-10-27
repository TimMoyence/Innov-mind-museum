import { ResponseMessage } from '../../../../../shared/domaine/index';

export interface IAMuseumArtInterface {
  askQuestionOnArtToIA(
    artName: string,
    artist: string,
    responseTon: string,
  ): Promise<ResponseMessage>;
}
