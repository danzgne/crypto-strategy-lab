export interface LivenessStatus {
  service: 'backend';
  status: 'ok';
}

export interface ReadinessStatus {
  service: 'backend';
  status: 'ready';
  database: 'connected';
}

export interface HealthService {
  getLiveness(): LivenessStatus;
  getReadiness(): Promise<ReadinessStatus>;
}
