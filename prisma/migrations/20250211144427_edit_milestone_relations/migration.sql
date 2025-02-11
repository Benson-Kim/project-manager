/*
  Warnings:

  - You are about to drop the column `taskId` on the `Milestone` table. All the data in the column will be lost.
  - Made the column `projectId` on table `Milestone` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateTable
CREATE TABLE "_MilestoneTasks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_MilestoneTasks_A_fkey" FOREIGN KEY ("A") REFERENCES "Milestone" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_MilestoneTasks_B_fkey" FOREIGN KEY ("B") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Milestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leaderId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "budget" REAL,
    "status" TEXT NOT NULL,
    "progress" REAL NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Milestone_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Milestone_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Milestone" ("assigneeId", "budget", "createdAt", "description", "endDate", "id", "leaderId", "name", "progress", "projectId", "startDate", "status", "updatedAt") SELECT "assigneeId", "budget", "createdAt", "description", "endDate", "id", "leaderId", "name", "progress", "projectId", "startDate", "status", "updatedAt" FROM "Milestone";
DROP TABLE "Milestone";
ALTER TABLE "new_Milestone" RENAME TO "Milestone";
CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");
CREATE INDEX "Milestone_leaderId_idx" ON "Milestone"("leaderId");
CREATE INDEX "Milestone_assigneeId_idx" ON "Milestone"("assigneeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "_MilestoneTasks_AB_unique" ON "_MilestoneTasks"("A", "B");

-- CreateIndex
CREATE INDEX "_MilestoneTasks_B_index" ON "_MilestoneTasks"("B");
