-- 093_minutes_summary_conclusion_titles.sql — the minutes' Summary and Conclusion headings can be renamed
--   like the Agenda and carried-over headings. Only widens the SectionKey check, so every row already passes.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_MeetingMinutesSection_Key'
             AND parent_object_id = OBJECT_ID(N'app.MeetingMinutesSection')
             AND definition NOT LIKE N'%''Summary''%')
    ALTER TABLE app.MeetingMinutesSection DROP CONSTRAINT CK_MeetingMinutesSection_Key;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_MeetingMinutesSection_Key'
                 AND parent_object_id = OBJECT_ID(N'app.MeetingMinutesSection'))
    ALTER TABLE app.MeetingMinutesSection ADD CONSTRAINT CK_MeetingMinutesSection_Key
        CHECK (SectionKey IN (N'CarryOver', N'Agenda', N'Summary', N'Conclusion'));
GO
