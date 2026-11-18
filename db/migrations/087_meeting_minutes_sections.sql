-- 087_meeting_minutes_sections.sql — the minutes' own sections.
--   A row WITH a SectionKey gives that built-in section (CarryOver, Agenda, Discussion, Conclusion) a new title
--   and may give it text, such as the conclusion. A row WITHOUT a key is a box a user added, shown in SortOrder.
--   No row means the built-in default title. One live row per built-in section per meeting. Soft delete, as on
--   the other meeting tables; deleting a built-in section's row brings its default title back.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.MeetingMinutesSection', N'U') IS NULL
    CREATE TABLE app.MeetingMinutesSection (
        MeetingMinutesSectionId INT IDENTITY(1, 1) NOT NULL
            CONSTRAINT PK_MeetingMinutesSection PRIMARY KEY,
        MeetingId               INT           NOT NULL
            CONSTRAINT FK_MeetingMinutesSection_Meeting REFERENCES app.Meeting (MeetingId),
        SectionKey              NVARCHAR(32)  NULL
            CONSTRAINT CK_MeetingMinutesSection_Key
            CHECK (SectionKey IN (N'CarryOver', N'Agenda', N'Discussion', N'Conclusion')),
        Title                   NVARCHAR(200) NOT NULL
            CONSTRAINT CK_MeetingMinutesSection_Title CHECK (LEN(Title) > 0),
        Body                    NVARCHAR(MAX) NULL,
        SortOrder               INT           NOT NULL CONSTRAINT DF_MeetingMinutesSection_SortOrder DEFAULT 0,
        IsDeleted               BIT           NOT NULL CONSTRAINT DF_MeetingMinutesSection_IsDeleted DEFAULT 0,
        DeletedAtUtc            DATETIME2     NULL,
        DeletedBy               INT           NULL,
        CreatedAtUtc            DATETIME2     NOT NULL
            CONSTRAINT DF_MeetingMinutesSection_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy               INT           NOT NULL,
        UpdatedAtUtc            DATETIME2     NULL,
        UpdatedBy               INT           NULL,
        RowVer                  ROWVERSION    NOT NULL
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MeetingMinutesSection_Key'
               AND object_id = OBJECT_ID(N'app.MeetingMinutesSection'))
    CREATE UNIQUE INDEX UX_MeetingMinutesSection_Key
        ON app.MeetingMinutesSection (MeetingId, SectionKey)
        WHERE SectionKey IS NOT NULL AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MeetingMinutesSection_Meeting'
               AND object_id = OBJECT_ID(N'app.MeetingMinutesSection'))
    CREATE INDEX IX_MeetingMinutesSection_Meeting
        ON app.MeetingMinutesSection (MeetingId, IsDeleted, SortOrder);
GO
