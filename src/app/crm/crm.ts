import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-crm',
  imports: [CommonModule],
  templateUrl: './crm.html',
  styleUrl: './crm.css',
})
export class Crm {
  guests = [
    { name: 'Alexandra Voss',   tier: 'Diamond', stays: 42, ltv: '$186,400', last: 'Jun 2026', status: 'Active' },
    { name: 'Marcus Beaumont',  tier: 'Platinum', stays: 18, ltv: '$74,200', last: 'May 2026', status: 'Active' },
    { name: 'Chiara Fontaine',  tier: 'Gold',    stays: 9,  ltv: '$28,500', last: 'Mar 2026', status: 'Active' },
    { name: 'James Okafor',     tier: 'Silver',  stays: 3,  ltv: '$8,900',  last: 'Jan 2026', status: 'Inactive' }
  ];
}
