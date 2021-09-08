import { TestBed } from '@angular/core/testing';

import { ImdbServiceService } from './imdb-service.service';

describe('ImdbServiceService', () => {
  let service: ImdbServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ImdbServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
