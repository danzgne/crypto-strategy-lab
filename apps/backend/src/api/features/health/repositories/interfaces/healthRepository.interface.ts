export interface HealthRepository {
  checkConnection(): Promise<void>;
  recordStarted(instanceId: string): Promise<void>;
  recordStopped(instanceId: string): Promise<void>;
}
