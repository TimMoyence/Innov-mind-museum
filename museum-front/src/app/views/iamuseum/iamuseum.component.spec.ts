import { ComponentFixture, TestBed } from '@angular/core/testing';

import IAMuseumComponent from './iamuseum.component';

describe('IAMuseumComponent', () => {
  let component: IAMuseumComponent;
  let fixture: ComponentFixture<IAMuseumComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IAMuseumComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(IAMuseumComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
