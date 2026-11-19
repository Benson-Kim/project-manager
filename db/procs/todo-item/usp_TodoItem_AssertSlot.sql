-- usp_TodoItem_AssertSlot — the planner-slot rule shared by usp_TodoItem_Create and
--   usp_TodoItem_Schedule, so a bad slot reads as a validation message; CK_TodoItem_Schedule
--   (migration 082) still holds the invariant. Both NULL = no slot.
-- THROW 50004 VALIDATION : start and end not both set; the end not after the start, or after the
--   next midnight.
-- Module: todo-items.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_AssertSlot
    @ScheduledStart DATETIME2(0),
    @ScheduledEnd   DATETIME2(0)
AS
BEGIN
    SET NOCOUNT ON;

    IF (@ScheduledStart IS NULL AND @ScheduledEnd IS NOT NULL)
       OR (@ScheduledStart IS NOT NULL AND @ScheduledEnd IS NULL)
        THROW 50004, N'VALIDATION:Give both a start and an end time', 1;
    IF @ScheduledEnd <= @ScheduledStart
        THROW 50004, N'VALIDATION:The end time must be after the start time', 1;
    IF @ScheduledEnd > DATEADD(DAY, 1, CAST(CAST(@ScheduledStart AS DATE) AS DATETIME2(0)))
        THROW 50004, N'VALIDATION:The time must end by midnight', 1;
END;
GO
