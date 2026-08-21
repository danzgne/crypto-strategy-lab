export interface HealthRepository {
  checkConnection(): Promise<void>;
}
