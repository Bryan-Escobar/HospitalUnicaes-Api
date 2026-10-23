export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  uptime: number;
  database: 'up' | 'down';
}
