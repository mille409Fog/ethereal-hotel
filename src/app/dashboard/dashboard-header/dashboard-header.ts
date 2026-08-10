import { Component, Input } from '@angular/core';
import { BackendStatus } from '../../services/dashboard-api.service';

@Component({
  selector: 'app-dashboard-header',
  imports: [],
  templateUrl: './dashboard-header.html',
  styleUrl: './dashboard-header.css',
})
export class DashboardHeader {
  @Input() status: BackendStatus = 'checking';
}
