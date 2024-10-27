import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlingService {
  
  public handleError(error: any) {
    // Gérez votre logique d'erreur ici
    console.error('An error occurred:', error.message || error);
  }
}
