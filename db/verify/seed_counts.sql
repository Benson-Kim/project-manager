-- CI assertion: row counts after scripts/db-apply.sh match the
-- docs/source/analysis/access-database.md §4 inventory exactly (job db:apply).
-- Fails the batch (sqlcmd -b) on any mismatch.
USE ProjectManager;
GO
DECLARE @Errors NVARCHAR(MAX) = N'';
IF (SELECT COUNT(*) FROM app.[Project]) <> 18 SET @Errors += N'Project<>18 (got ' + CAST((SELECT COUNT(*) FROM app.[Project]) AS NVARCHAR(12)) + N'); ';
-- ProjectAssignee: 0 in normal runs; E2E_SEED=1 adds 2 rows for e2e-pm + e2e-contributor on project 2.
DECLARE @ExpectedPA INT = CASE WHEN N'$(E2E_SEED)' = N'1' THEN 2 ELSE 0 END;
IF (SELECT COUNT(*) FROM app.[ProjectAssignee]) <> @ExpectedPA SET @Errors += N'ProjectAssignee<>' + CAST(@ExpectedPA AS NVARCHAR(12)) + N' (got ' + CAST((SELECT COUNT(*) FROM app.[ProjectAssignee]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[Stakeholder]) <> 8 SET @Errors += N'Stakeholder<>8 (got ' + CAST((SELECT COUNT(*) FROM app.[Stakeholder]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[Supplier]) <> 12 SET @Errors += N'Supplier<>12 (got ' + CAST((SELECT COUNT(*) FROM app.[Supplier]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[Keyword]) <> 29 SET @Errors += N'Keyword<>29 (got ' + CAST((SELECT COUNT(*) FROM app.[Keyword]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[KeyDeliverable]) <> 8 SET @Errors += N'KeyDeliverable<>8 (got ' + CAST((SELECT COUNT(*) FROM app.[KeyDeliverable]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[Objective]) <> 6 SET @Errors += N'Objective<>6 (got ' + CAST((SELECT COUNT(*) FROM app.[Objective]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[Meeting]) <> 5 SET @Errors += N'Meeting<>5 (got ' + CAST((SELECT COUNT(*) FROM app.[Meeting]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[MeetingAgendaItem]) <> 3 SET @Errors += N'MeetingAgendaItem<>3 (got ' + CAST((SELECT COUNT(*) FROM app.[MeetingAgendaItem]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[MeetingDiscussionPoint]) <> 3 SET @Errors += N'MeetingDiscussionPoint<>3 (got ' + CAST((SELECT COUNT(*) FROM app.[MeetingDiscussionPoint]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[MeetingParticipant]) <> 8 SET @Errors += N'MeetingParticipant<>8 (got ' + CAST((SELECT COUNT(*) FROM app.[MeetingParticipant]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[MeetingActionItem]) <> 9 SET @Errors += N'MeetingActionItem<>9 (got ' + CAST((SELECT COUNT(*) FROM app.[MeetingActionItem]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[QuestionAnswer]) <> 12 SET @Errors += N'QuestionAnswer<>12 (got ' + CAST((SELECT COUNT(*) FROM app.[QuestionAnswer]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[AssumptionConstraint]) <> 8 SET @Errors += N'AssumptionConstraint<>8 (got ' + CAST((SELECT COUNT(*) FROM app.[AssumptionConstraint]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[RiskIssue]) <> 2 SET @Errors += N'RiskIssue<>2 (got ' + CAST((SELECT COUNT(*) FROM app.[RiskIssue]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[Note]) <> 7 SET @Errors += N'Note<>7 (got ' + CAST((SELECT COUNT(*) FROM app.[Note]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[NoteTab]) <> 0 SET @Errors += N'NoteTab<>0 (got ' + CAST((SELECT COUNT(*) FROM app.[NoteTab]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[ItResourceCategory]) <> 15 SET @Errors += N'ItResourceCategory<>15 (got ' + CAST((SELECT COUNT(*) FROM app.[ItResourceCategory]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[ItResourceItem]) <> 18 SET @Errors += N'ItResourceItem<>18 (got ' + CAST((SELECT COUNT(*) FROM app.[ItResourceItem]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[Financial]) <> 2 SET @Errors += N'Financial<>2 (got ' + CAST((SELECT COUNT(*) FROM app.[Financial]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[FinancialDocumentType]) <> 9 SET @Errors += N'FinancialDocumentType<>9 (got ' + CAST((SELECT COUNT(*) FROM app.[FinancialDocumentType]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[FinancialDocument]) <> 9 SET @Errors += N'FinancialDocument<>9 (got ' + CAST((SELECT COUNT(*) FROM app.[FinancialDocument]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[ParkingLotItem]) <> 12 SET @Errors += N'ParkingLotItem<>12 (got ' + CAST((SELECT COUNT(*) FROM app.[ParkingLotItem]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[DailyActivity]) <> 13 SET @Errors += N'DailyActivity<>13 (got ' + CAST((SELECT COUNT(*) FROM app.[DailyActivity]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[TodoItem]) <> 16 SET @Errors += N'TodoItem<>16 (got ' + CAST((SELECT COUNT(*) FROM app.[TodoItem]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[TodoAlert]) <> 4 SET @Errors += N'TodoAlert<>4 (got ' + CAST((SELECT COUNT(*) FROM app.[TodoAlert]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[ExistingSystemInterface]) <> 0 SET @Errors += N'ExistingSystemInterface<>0 (got ' + CAST((SELECT COUNT(*) FROM app.[ExistingSystemInterface]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM app.[ActivityStatus]) <> 4 SET @Errors += N'ActivityStatus<>4 (got ' + CAST((SELECT COUNT(*) FROM app.[ActivityStatus]) AS NVARCHAR(12)) + N'); ';
-- auth schema (module #4): 4 roles + exactly one seeded admin (e2e users are
-- opt-in via E2E_SEED=1 and intentionally not asserted here).
IF (SELECT COUNT(*) FROM auth.[Role]) <> 4 SET @Errors += N'auth.Role<>4 (got ' + CAST((SELECT COUNT(*) FROM auth.[Role]) AS NVARCHAR(12)) + N'); ';
IF (SELECT COUNT(*) FROM auth.[User] WHERE Username = N'admin' AND IsDeleted = 0) <> 1 SET @Errors += N'auth.User admin<>1 (got ' + CAST((SELECT COUNT(*) FROM auth.[User] WHERE Username = N'admin' AND IsDeleted = 0) AS NVARCHAR(12)) + N'); ';
IF (SELECT MustChangePassword FROM auth.[User] WHERE Username = N'admin' AND IsDeleted = 0) <> 1 SET @Errors += N'admin MustChangePassword<>1; ';
IF LEN(@Errors) > 0
BEGIN
    DECLARE @Msg NVARCHAR(2048) = N'Seed count mismatch: ' + LEFT(@Errors, 2000);
    THROW 50004, @Msg, 1;
END;
PRINT N'All seed row counts match the source inventory.';
GO
