import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Murmuration } from './murmuration';

describe('Murmuration', () => {
  let component: Murmuration;
  let fixture: ComponentFixture<Murmuration>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Murmuration],
    }).compileComponents();

    fixture = TestBed.createComponent(Murmuration);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
