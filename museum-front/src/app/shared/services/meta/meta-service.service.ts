import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root',
})
export class MetaService {
  constructor(private title: Title, private meta: Meta) {}

  setMetaData(data: any): void {
    this.title.setTitle(data.title);
    this.meta.updateTag({ name: 'description', content: data.description });
  }
}
