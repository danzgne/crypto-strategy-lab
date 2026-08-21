CREATE TABLE "service_heartbeats" (
    "id" UUID NOT NULL,
    "service" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMPTZ(3),

    CONSTRAINT "service_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_heartbeats_service_instanceId_key"
    ON "service_heartbeats"("service", "instanceId");

CREATE INDEX "service_heartbeats_service_lastSeenAt_idx"
    ON "service_heartbeats"("service", "lastSeenAt");
