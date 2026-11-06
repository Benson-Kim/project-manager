-- 062_requirement_test_cases.sql — test cases in the requirement register (ADR-0037, amendment
-- 2026-11-05). A test case (TC) is a requirement row of its own kind: it is numbered TC-1, TC-2 like
-- the other kinds, links up to the functional, non-functional and transitional requirements it
-- proves through app.RequirementTrace, and its met tick says it passed. Needs still carry no tick.
-- No row changes: both checks only widen, so every existing row already passes them.
USE ProjectManager;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Requirement_Type'
             AND parent_object_id = OBJECT_ID(N'app.Requirement')
             AND definition NOT LIKE N'%''TC''%')
    ALTER TABLE app.Requirement DROP CONSTRAINT CK_Requirement_Type;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Requirement_Type'
                 AND parent_object_id = OBJECT_ID(N'app.Requirement'))
    ALTER TABLE app.Requirement ADD CONSTRAINT CK_Requirement_Type
        CHECK (RequirementType IN ('BR', 'SR', 'FR', 'NFR', 'TR', 'TC'));
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Requirement_Met'
             AND parent_object_id = OBJECT_ID(N'app.Requirement')
             AND definition LIKE N'%''FR''%')
    ALTER TABLE app.Requirement DROP CONSTRAINT CK_Requirement_Met;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Requirement_Met'
                 AND parent_object_id = OBJECT_ID(N'app.Requirement'))
    ALTER TABLE app.Requirement ADD CONSTRAINT CK_Requirement_Met
        CHECK (IsMet = 0 OR RequirementType NOT IN ('BR', 'SR'));
GO
