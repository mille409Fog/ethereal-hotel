import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';

@Component({
  selector: 'app-booking',
  imports: [CommonModule, ScrollRevealDirective],
  templateUrl: './booking.html',
  styleUrl: './booking.css',
})
export class Booking {
  rooms = [
    { name: 'Deluxe King', rate: '$520', tag: 'Most Popular' },
    { name: 'Grand Suite', rate: '$1,200', tag: 'Best Value' },
    { name: 'Penthouse', rate: '$3,800', tag: 'Exclusive' }
  ];
}
