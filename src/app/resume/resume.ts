import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';

@Component({
  selector: 'app-resume',
  imports: [CommonModule, ScrollRevealDirective],
  templateUrl: './resume.html',
  styleUrl: './resume.css',
})
export class Resume {
  jobs = [
    { 
      title: 'Senior Software Engineer', 
      company: 'Charter Communications', 
      period: 'June 2023 – Present', 
      bullets: [
        'Designed and launched multiple new revenue flows spanning the full stack, leveraging GraphQL APIs and Angular 22',
        'Hardened and maintained enterprise-level data pipelines across multiple environments, improving reliability',
        'Led large-scale codebase modernization initiative, improving maintainability and developer velocity'
      ] 
    },
    { 
      title: 'Software Engineer', 
      company: 'Feature 23', 
      period: 'March 2021 – June 2023', 
      bullets: [
        'Built enterprise Angular/C#/Blazor/T-SQL application handling high-volume transaction flows for major financial clearinghouse',
        'Developed tax filing application for government entity using Angular, C#, and SQL on Azure Government',
        'Implemented comprehensive XUnit and Selenium test coverage'
      ] 
    },
    { 
      title: 'Software Engineer', 
      company: 'Walmart Labs', 
      period: 'August 2018 – March 2021', 
      bullets: [
        'Built microservices in Java/Spring (MVC, Boot, Batch) to process device telemetry data at scale',
        'Engineered dynamic financial management application in Angular 8 with fully configurable fields',
        'Achieved broad test coverage with JUnit, Serenity, and Karma'
      ] 
    }
  ];

  skills = [
    'C#', 'Java', 'TypeScript', 'JavaScript', 'Python', 'Rust', 'Kotlin',
    'Angular', 'React', 'Blazor', 'ASP.NET', 'Spring Boot',
    'GraphQL', 'REST APIs', 'Node.js', 'Meteor.js',
    'T-SQL', 'SQL Server', 'Hibernate',
    'Azure', 'Microservices', 'XUnit', 'JUnit', 'Selenium'
  ];
}
