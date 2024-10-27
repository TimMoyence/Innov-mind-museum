import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { IAMuseumGetaway } from '../ports/IIaMuseum.getaway';

const httpOptions = {
  headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
};

@Injectable({
  providedIn: 'root',
})
export class IAMuseumService implements IAMuseumGetaway {
  protected static connectedUrl: string = 'ia/museum';

  constructor(protected http: HttpClient) {}

  postFormAndGetResponseOfIa(
    artName: string,
    artist: string,
    responseTon: string
  ): Observable<any> {
    return this.http
      .post(
        `${environment.apiURL}${IAMuseumService.connectedUrl}`,
        { artName, artist, responseTon },
        httpOptions
      )
      .pipe(tap());
  }
}
