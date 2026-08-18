import { prisma, queue } from '@crypto-strategy-lab/shared/src/db';
import { randomUUID } from 'crypto';

const workerId = randomUUID();
console.log(`[Worker ${workerId}] Starting up...`);

// Polling settings
let isShuttingDown = false;
const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 32000;
let currentBackoffMs = MIN_BACKOFF_MS;

// Sleep utility
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function processJob(job: any) {
  console.log(`[Worker ${workerId}] Processing job ${job.id} for experiment ${job.experimentId}...`);
  // Simulate heavy processing (backtest simulation)
  await sleep(2000);
  
  // Mark completed
  await queue.completeJob(job.id);
  console.log(`[Worker ${workerId}] Job ${job.id} completed.`);
}

async function loop() {
  while (!isShuttingDown) {
    try {
      const job = await queue.claimJob(workerId, 30);
      
      if (job) {
        // Job found! Reset backoff.
        currentBackoffMs = MIN_BACKOFF_MS;
        await processJob(job);
      } else {
        // No job found. Exponential backoff.
        console.log(`[Worker ${workerId}] No jobs found. Sleeping for ${currentBackoffMs}ms...`);
        await sleep(currentBackoffMs);
        currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS);
      }
    } catch (error) {
      console.error(`[Worker ${workerId}] Error in polling loop:`, error);
      // Wait a bit before retrying on crash
      await sleep(5000);
    }
  }
  
  console.log(`[Worker ${workerId}] Shutdown complete.`);
  await prisma.$disconnect();
  process.exit(0);
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log(`\n[Worker ${workerId}] Caught interrupt signal (SIGINT). Shutting down...`);
  isShuttingDown = true;
});

process.on('SIGTERM', () => {
  console.log(`\n[Worker ${workerId}] Caught terminate signal (SIGTERM). Shutting down...`);
  isShuttingDown = true;
});

// Start loop
loop();
