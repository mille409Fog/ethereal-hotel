import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';

@Component({
  selector: 'app-skills',
  imports: [ScrollRevealDirective],
  templateUrl: './skills.html',
  styleUrl: './skills.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skills {
  public readonly skillCategories = [
    {
      name: 'Frontend',
      skills: ['Angular', 'React', 'TypeScript', 'JavaScript', 'HTML/CSS', 'RxJS', 'NgRx'],
    },
    {
      name: 'Backend',
      skills: ['C#', 'Java', 'Node.js', 'ASP.NET', 'Spring Boot', 'REST APIs', 'GraphQL'],
    },
    {
      name: 'Database',
      skills: ['T-SQL', 'SQL Server', 'PostgreSQL', 'Hibernate', 'Entity Framework'],
    },
    {
      name: 'Cloud & DevOps',
      skills: ['Azure', 'AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Git', 'Jenkins'],
    },
    {
      name: 'Testing',
      skills: ['XUnit', 'JUnit', 'Karma', 'Jasmine', 'Selenium', 'Serenity'],
    },
    {
      name: 'Architecture',
      skills: ['Microservices', 'Event-Driven', 'Domain-Driven Design', 'SOLID', 'Design Patterns'],
    },
  ];
}
