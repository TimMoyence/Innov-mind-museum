import { IAMuseumForm } from '../models/museumForm';
import { Observable } from 'rxjs';

export interface IAMuseumGetaway {
  postFormAndGetResponseOfIa(
    artName: string,
    artist: string,
    responseTon: string
  ): Observable<IAMuseumForm>;
}
