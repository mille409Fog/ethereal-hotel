import { Component } from '@angular/core';
import { Navigation } from './navigation/navigation';
import { Hero } from './hero/hero';
import { Booking } from './booking/booking';
import { Crm } from './crm/crm';
import { Concierge } from './concierge/concierge';
import { Resume } from './resume/resume';
import { Footer } from './footer/footer';

@Component({
  selector: 'app-root',
  imports: [Navigation, Hero, Booking, Crm, Concierge, Resume, Footer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
