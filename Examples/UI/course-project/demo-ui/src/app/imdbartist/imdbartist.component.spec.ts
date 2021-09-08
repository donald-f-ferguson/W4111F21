import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImdbartistComponent } from './imdbartist.component';

describe('ImdbartistComponent', () => {
  let component: ImdbartistComponent;
  let fixture: ComponentFixture<ImdbartistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ImdbartistComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ImdbartistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
