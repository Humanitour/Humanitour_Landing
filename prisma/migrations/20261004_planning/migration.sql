-- Planning du back-office : evenements, taches, presences et absences.
--
-- Purement additive : trois types et trois tables. Rien n'est renomme ni
-- supprime.

-- CreateEnum
CREATE TYPE "PlanningEventKind" AS ENUM ('EDITORIAL', 'MEETING', 'FIELD', 'OTHER');

-- CreateEnum
CREATE TYPE "PlanningTaskStatus" AS ENUM ('TODO', 'DOING', 'DONE');

-- CreateEnum
CREATE TYPE "AvailabilityKind" AS ENUM ('PRESENT', 'ABSENT');

-- CreateTable
CREATE TABLE "PlanningEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "PlanningEventKind" NOT NULL DEFAULT 'OTHER',
    "note" TEXT,
    "channel" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "status" "PlanningTaskStatus" NOT NULL DEFAULT 'TODO',
    "dueOn" DATE,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AvailabilityKind" NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningEvent_startsAt_idx" ON "PlanningEvent"("startsAt");

-- CreateIndex
CREATE INDEX "PlanningTask_status_dueOn_idx" ON "PlanningTask"("status", "dueOn");

-- CreateIndex
CREATE INDEX "PlanningTask_assigneeId_idx" ON "PlanningTask"("assigneeId");

-- CreateIndex
CREATE INDEX "TeamAvailability_startsOn_endsOn_idx" ON "TeamAvailability"("startsOn", "endsOn");

-- CreateIndex
CREATE INDEX "TeamAvailability_userId_idx" ON "TeamAvailability"("userId");

-- AddForeignKey
ALTER TABLE "PlanningEvent" ADD CONSTRAINT "PlanningEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningTask" ADD CONSTRAINT "PlanningTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningTask" ADD CONSTRAINT "PlanningTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAvailability" ADD CONSTRAINT "TeamAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

