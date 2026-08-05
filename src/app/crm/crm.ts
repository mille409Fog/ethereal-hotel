import { Component } from '@angular/core';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';

@Component({
  selector: 'app-crm',
  imports: [ScrollRevealDirective],
  templateUrl: './crm.html',
  styleUrl: './crm.css',
})
export class Crm {
  jobs = [
    { 
      title: 'Senior Software Engineer',
      company: 'Charter Communications',
      period: 'June 2023 – Present',
      bullets: [
        'Architected and launched multiple revenue-generating features across the full stack using Angular 22 and GraphQL',
        'Hardened enterprise data pipelines processing millions of daily transactions with improved reliability',
        'Led codebase modernization initiative improving developer velocity and maintainability'
      ],
      tech: ['Angular 22', 'GraphQL', 'TypeScript', 'Azure', 'CI/CD']
    },
    { 
      title: 'Software Engineer',
      company: 'Feature 23',
      period: 'March 2021 – June 2023',
      bullets: [
        'Built enterprise Angular/C#/Blazor application handling high-volume transactions for financial clearinghouse',
        'Developed government tax filing platform using Angular, C#, and SQL on Azure Government cloud',
        'Established comprehensive testing strategy with XUnit and Selenium'
      ],
      tech: ['Angular', 'C#', 'Blazor', 'T-SQL', 'Azure']
    },
    { 
      title: 'Software Engineer',
      company: 'Walmart Labs',
      period: 'August 2018 – March 2021',
      bullets: [
        'Engineered Java/Spring microservices processing device telemetry data at retail scale',
        'Built dynamic financial management application in Angular 8 with fully configurable fields',
        'Achieved broad test coverage with JUnit, Serenity, and Karma'
      ],
      tech: ['Java', 'Spring Boot', 'Angular 8', 'Microservices']
    }
  ];
}
