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
  projects = [
    { 
      name: 'Revenue Analytics Platform', 
      description: 'GraphQL-powered analytics processing millions of transactions daily with real-time dashboards',
      category: 'Telecommunications',
      tech: ['Angular 22', 'GraphQL', 'TypeScript', 'Azure']
    },
    { 
      name: 'Financial Clearinghouse System', 
      description: 'High-volume transaction processing for major financial institutions with comprehensive audit trails',
      category: 'Finance',
      tech: ['Angular', 'C#', 'T-SQL', 'Blazor']
    },
    { 
      name: 'Device Telemetry Pipeline', 
      description: 'Scalable microservices architecture processing IoT data at enterprise scale',
      category: 'Retail',
      tech: ['Java', 'Spring Boot', 'Kafka', 'Microservices']
    }
  ];
}
