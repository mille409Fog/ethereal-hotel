import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Wanderquest } from './wanderquest';

describe('Wanderquest', () => {
  let component: Wanderquest;
  let fixture: ComponentFixture<Wanderquest>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Wanderquest],
    }).compileComponents();

    fixture = TestBed.createComponent(Wanderquest);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
