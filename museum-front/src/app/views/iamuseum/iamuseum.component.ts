import { NgClass } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IAMuseumService } from '../../core/adapters/iaMuseum.getaway';
import { IAMuseumForm } from '../../core/models/museumForm';

@Component({
  selector: 'app-iamuseum',
  standalone: true,
  imports: [FormsModule, NgClass],
  templateUrl: './iamuseum.component.html',
  styleUrl: './iamuseum.component.scss',
})
export default class IAMuseumComponent {
  iamuseumForm: IAMuseumForm = new IAMuseumForm();

  private iaMuseumService = inject(IAMuseumService);

  loading = false;
  response: string | null = null;
  selectedValue = signal<string>('');
  // bosser sur le faite que ce soit comme un search et que ce soit appellable plusieurs fois

  addValueToForm(value: string) {
    this.iamuseumForm.responseTon = value;
    this.selectedValue.set(value);
  }

  onSubmit(form: any) {
    this.loading = true;
    this.iaMuseumService
      .postFormAndGetResponseOfIa(
        this.iamuseumForm.artName,
        this.iamuseumForm.artist,
        this.iamuseumForm.responseTon
      )
      .subscribe((responseOfIA) => {
        if (responseOfIA) {
          this.loading = false;
          this.response = responseOfIA.message;
        } else {
          this.loading = false;
          this.response = 'Error! Please try again.';
        }
        form.resetForm();
      });
  }
}
