/*
  Warnings:

  - You are about to drop the `Milestone` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `ismilestone` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `milestoneId` on the `Task` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Milestone_leaderId_idx";

-- DropIndex
DROP INDEX "Milestone_projectId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Milestone";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "progress" REAL NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "parentId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "dependencies" TEXT,
    "milestone" BOOLEAN NOT NULL DEFAULT false,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "baselineStart" DATETIME,
    "baselineEnd" DATETIME,
    "projectId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assigneeId", "baselineEnd", "baselineStart", "createdAt", "critical", "dependencies", "description", "endDate", "id", "parentId", "position", "priority", "progress", "projectId", "startDate", "status", "title", "updatedAt") SELECT "assigneeId", "baselineEnd", "baselineStart", "createdAt", "critical", "dependencies", "description", "endDate", "id", "parentId", "position", "priority", "progress", "projectId", "startDate", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
