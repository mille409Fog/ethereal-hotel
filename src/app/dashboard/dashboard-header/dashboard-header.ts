import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BackendStatus } from '../../services/dashboard-api.service';

@Component({
  selector: 'app-dashboard-header',
  imports: [],
  templateUrl: './dashboard-header.html',
  styleUrl: './dashboard-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardHeader {
  public readonly status = input<BackendStatus>('checking');
}
