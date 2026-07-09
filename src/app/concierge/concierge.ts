import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-concierge',
  imports: [CommonModule],
  templateUrl: './concierge.html',
  styleUrl: './concierge.css',
})
export class Concierge {
  stats = [
    { label: 'Open', value: '7', color: 'blue' },
    { label: 'In Progress', value: '3', color: 'amber' },
    { label: 'Resolved Today', value: '24', color: 'green' },
    { label: 'Avg Response', value: '4 min', color: 'purple' }
  ];

  requests = [
    { id: '#1042', room: '812', request: 'Extra pillows & turndown service', priority: 'High',   assignee: 'Sofia R.',  status: 'In Progress', time: '2 min ago' },
    { id: '#1041', room: '604', request: 'Restaurant reservation — 8pm for 4', priority: 'Medium', assignee: 'Marcus T.', status: 'Open',        time: '9 min ago' },
    { id: '#1040', room: '1104', request: 'Airport transfer — tomorrow 6am',   priority: 'High',   assignee: 'Unassigned', status: 'Open',       time: '14 min ago' },
    { id: '#1039', room: '302', request: 'Late checkout request',              priority: 'Low',    assignee: 'Sofia R.',  status: 'Resolved',    time: '31 min ago' }
  ];
}
