export interface ServiceHeartbeatRepository {
  recordStarted(workerId: string): Promise<void>;
  recordHeartbeat(workerId: string): Promise<void>;
  recordStopped(workerId: string): Promise<void>;
}
