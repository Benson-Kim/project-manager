# Access_database.mdb — Complete Extraction

Source file: `Access_database.mdb` (5,423,104 bytes, ACE format — "Standard ACE DB", version byte `0x03` = Access 2010 file format, 4096-byte pages, 1324 pages).

> Extraction method: the CI environment has no network access to install `mdbtools`, so the file was parsed with a purpose-built pure-Python Jet4/ACE reader (`tools/mdb/mdbread.py`). For **every table the number of extracted rows exactly matches the row count declared in the table definition page**, and no field decoding errors remained. Limitations: VBA module source, form/report layouts (stored in binary `MSysAccessStorage` streams) and index definitions are inventoried by name but their binary payloads are not decompiled.
>
> **Verified with mdbtools (independent second pass, see [VERIFICATION.md](VERIFICATION.md)):** the original pass skipped MSysObjects rows whose row-offset slot carries the `0x8000` flag. Most of those are genuinely deleted UI objects, but **three tables and six saved queries are still live** (mdbtools lists and exports them): `tblMeetingMinutes` (5 rows), `tblFinancialDocuments` (9 rows), `Switchboard Items` (0 rows) and queries `qryDailyItemsAndStatusType`, `qryKeyReqDeliverables`, `qryMeetingParticipants`, `qryProject3rdPartySupplier`, `qryProjectfrmQA`, `qryQuesAns`. They are included in §2/§4/§5 below and marked *(recovered)*. All other content was confirmed unchanged (82-check CI verification, both parsers agree byte-for-byte on shared objects).

## 1. Object inventory (from MSysObjects, 244 live-slot objects + recovered objects)

### Type 1 — Local table (52)

`MSysACEs`, `MSysAccessStorage`, `MSysAccessXML`, `MSysComplexColumns`, `MSysComplexType_Attachment`, `MSysComplexType_Decimal`, `MSysComplexType_GUID`, `MSysComplexType_IEEEDouble`, `MSysComplexType_IEEESingle`, `MSysComplexType_Long`, `MSysComplexType_Short`, `MSysComplexType_Text`, `MSysComplexType_UnsignedByte`, `MSysNameMap`, `MSysNavPaneGroupCategories`, `MSysNavPaneGroupToObjects`, `MSysNavPaneGroups`, `MSysNavPaneObjectIDs`, `MSysObjects`, `MSysQueries`, `MSysRelationships`, `MSysResources`, `f_10A507954BDC4AED8B2702AD9617E985_Attachment`, `f_18D99D0B9F2B4EF79FCE40B6F0C89337_Documentation`, `f_3E3EC6ED2D6141538654E4E37770C497_Data`, `tbl3rdPartySupplier`, `tblKeywords`, `tblActivityStatusType`, `tblAssumptionsConstraints`, `tblDailyActivityList`, `tblExistingSystemsInterfaces`, `tblFinancials`, `tblITResourcePlanning`, `tblITResourcePlanningDetails`, `tblInterviewQuestionsAnswers`, `tblKeyRequirementsDeliverable`, `tblMeetingActionItems`, `tblMeetingAgenda`, `tblMeetingDiscussionPoints`, `tblMeetingParticipants`, `tblNotes`, `tblParkingLotItems`, `tblProjectFinancialDocuments`, `tblProjectFramework`, `tblProjectObjectives`, `tblProjectSummary`, `tblProjectTask`, `tblProjectTaskList`, `tblRisksIssuesTracker`, `tblStakeholders`, `tblTaskFramework`, `tblTodoList`

*(recovered, deleted-flagged slots but still live per mdbtools)*: `Switchboard Items`, `tblFinancialDocuments`, `tblMeetingMinutes` — total **55 local tables / 30 user tables**.

### Type 2 — Database (1)

`MSysDb`

### Type 3 — Container (9)

`DataAccessPages`, `Databases`, `Forms`, `Modules`, `Relationships`, `Reports`, `Scripts`, `SysRel`, `Tables`

### Type 5 — Query (QueryDef) (68)

`qryKeywords`, `qryAssumptionsConstraints`, `qryDailyActivityList`, `qryDailyActivityListExtended`, `qryDailyItemsAndStatusTypeByChoice`, `qryFinancialsExtended`, `qryITResourcePlanning`, `qryInProgressToDo`, `qryMeetingApologies`, `qryMeetingAttendees`, `qryMeetingMinutes`, `qryMeetingMinutes Extended`, `qryMinutes`, `qryObjectives`, `qryParkingLotItems`, `qryProject`, `qryProjectKeywords`, `qryProjectActivityList`, `qryProjectExistingSystem`, `qryProjectFramework`, `qryProjectKeyRequirementsDeliverable`, `qryProjectObjectives`, `qryProjectReports`, `qryProjectStakeholders`, `qryStakeholders`, `qrySuppliers`, `qryUpcomingAlerts`, *(recovered)* `qryDailyItemsAndStatusType`, `qryKeyReqDeliverables`, `qryMeetingParticipants`, `qryProject3rdPartySupplier`, `qryProjectfrmQA`, `qryQuesAns` — **33 named queries** total, plus UI record-source queries: `~sq_cActivity List~sq_ccboFilterFavorites`, `~sq_cfrmDailyItemsAndStatusTypeChoice~sq_cProjectNameCopy`, `~sq_cfrmProjectReports~sq_ccboProject`, `~sq_cfrmReportSelector~sq_cListProjects`, `~sq_cfrmSubKeywords~sq_csubfrmEntryKeywords`, `~sq_cfrmSubDailyItemsAndStatusType~sq_cProjectID`, `~sq_cfrmSubFinancials~sq_csubfrmEntryKeywords`, `~sq_cfrmSubMeetingMinutes~sq_caddMeetingMinutesub`, `~sq_cfrmSubMeetingMinutes~sq_csubfrmMeetingActionItems`, `~sq_cfrmSubNotes~sq_csubfrmEntryKeywords`, `~sq_cfrmSubNotes~sq_csubfrmListKeywords`, `~sq_cfrmSubObjectives~sq_csubfrmEntryObjectives`, `~sq_cfrmSubParkingLotItems~sq_csubfrmEntryParkingLotItems`, `~sq_cfrmSubParkingLotItems~sq_csubfrmListParkingLotItems`, `~sq_cfrmSubQuestionsAnswers~sq_csubfrmListQuestionsAnswers`, `~sq_cfrmSubStakeholders~sq_csubfrmListStakeholders`, `~sq_cfrmSubSuppliers~sq_csubfrmListSuppliers`, `~sq_csubfrmEntryFinancials~sq_csubformFinancialDocuments`, `~sq_csubfrmEntryITResourcePlanning~sq_csubformResourcesPlanning`, `~sq_csubfrmMeetingAgenda~sq_csubfrmMeetingActionItems`, `~sq_csubfrmMeetingAgenda~sq_csubfrmMeetingDiscussionPoints`, `~sq_drptDetailedProjectReportS~sq_dsubrptMeetingMinutes`, `~sq_drptMeetingMinutes~sq_dsubrptMeetingApologies`, `~sq_dsubrptMeetingMinutes~sq_dsubrptMeetingApologies`, `~sq_fSwitchboard`, `~sq_ffrmSubProjects`, `~sq_fsubfrmEntryITResourcePlanning`, `~sq_fsubfrmEntryQuestionsAnswers`, `~sq_fsubfrmEntrySuppliers`, `~sq_fsubfrmListKeywords`, `~sq_fsubfrmListFinancials`, `~sq_fsubfrmListKeyReqDeliverables`, `~sq_fsubfrmListParkingLotItems`, `~sq_fsubfrmListResourcesPlanning`, `~sq_fsubfrmListRisksIssuesTracker`, `~sq_fsubfrmListSuppliers`, `~sq_rsubrptFinancials`, `~sq_rsubrptKeyReqDeliverables`, `~sq_rsubrptObjectives`, `~sq_rsubrptParkingLotItems`, `~sq_rsubrptStakeholders`

### Type 8 — Relationship layout (28)

`MSysNavPaneGroupCategoriesMSysNavPaneGroups`, `MSysNavPaneGroupsMSysNavPaneGroupToObjects`, `tblDailyActivityListtblTodoList`, `tblFinancialDocumentstblProjectFinancialDocuments`, `tblFinancialDocumentstblProjectFinancialDocuments1`, `tblFinancialstblProjectFinancialDocuments`, `tblITResourcePlanningtblITResourcePlanningDetails`, `tblMeetingAgendatblMeetingActionItems`, `tblMeetingAgendatblMeetingDiscussionPoints`, `tblMeetingDiscussionPointstblMeetingActionItems`, `tblMeetingMinutestblMeetingAgenda`, `tblMeetingParticipantstblMeetingActionItems`, `tblProjectFrameworktblDailyActivityList`, `tblProjectFrameworktblFinancials`, `tblProjectFrameworktblITResourcePlanning`, `tblProjectFrameworktblNotes`, `tblProjectFrameworktblParkingLotItems`, `tblProjectFrameworktblRisksIssuesTracker`, `tblProjectFrameworktblTodoList`, `{0165F646-833E-4716-9403-440F9C57EA49}`, `{0DD90E7A-E3EF-4F91-85EB-8065C24AE60F}`, `{6A708F5C-9150-4690-8E46-777E3C3E50E3}`, `{7346213B-4409-49BB-9CD1-F3D53FD2BDB4}`, `{8F9E8E92-C5E7-4787-B821-9D0EDE34618F}`, `{97A3B925-0830-4FB0-99D4-DC181F8EB6E6}`, `{A6C448E7-8EB9-4DEE-8D6E-D5D7B56A43C7}`, `{AF23FC65-918C-470F-A209-2631B9FCCF34}`, `{E5806E09-FE83-42AD-B946-BB3635415A88}`

### Type -32757 — Database property blob (2)

`SummaryInfo`, `UserDefined`

### Type -32758 — Other (1)

`Admin`

### Type -32761 — Module (4)

`ApplyTextStrikethrough`, `GetConcatFields`, `Module1`, `TodoList Alerts`

### Type -32764 — Report (25)

`Relationships for Project-Task Framework`, `rptKeywords`, `rptAssumpConst`, `rptDetailedProjectReport`, `rptDynamicReport`, `rptFinancials`, `rptITResourcePlanning`, `rptKeyReqDeliverables`, `rptMeetingMinutes`, `rptParkingLotItems`, `rptQuesAns`, `rptStakeholders`, `rptSuppliers`, `subrptKeywords`, `subrptAssumptionsConstraints`, `subrptFinancials`, `subrptITResourcePlanning`, `subrptKeyReqDeliverables`, `subrptMeetingApologies`, `subrptMeetingAttendees`, `subrptMeetingMinutes`, `subrptObjectives`, `subrptQuesAns`, `subrptStakeholders`, `subrptSuppliers`

### Type -32766 — Macro (2)

`AutoExec`, `~TMPCLPMacro`

### Type -32768 — Form (52)

`Main Menu`, `Switchboard`, `frmCreateNotePages`, `frmProjectFramework`, `frmProjectReports`, `frmReportBuilder`, `frmReportSelector`, `frmSubKeywords`, `frmSubConstraintsAssumptions`, `frmSubDailyItemsAndStatusType`, `frmSubKeyRequirementDeliverables`, `frmSubMeetingMinutes`, `frmSubNote`, `frmSubNotes`, `frmSubObjectives`, `frmSubParkingLotItems`, `frmSubProjects`, `frmSubQuestionsAnswers`, `frmSubStakeholders`, `frmSubSuppliers`, `subformMinutesList`, `subformResourcesPlanning`, `subformRisksIssuesTracker`, `subfrmEntryKeywords`, `subfrmEntryConstraintsAssumptions`, `subfrmEntryDailyActivities`, `subfrmEntryFinancials`, `subfrmEntryITResourcePlanning`, `subfrmEntryObjectives`, `subfrmEntryParkingLotItems`, `subfrmEntryQuestionsAnswers`, `subfrmEntryRiskIssues`, `subfrmEntryStakeholders`, `subfrmEntrySuppliers`, `subfrmEntryTodoList`, `subfrmListKeywords`, `subfrmListConstraintsAssumptions`, `subfrmListKeyReqDeliverables`, `subfrmListMinutes`, `subfrmListObjectives`, `subfrmListParkingLotItems`, `subfrmListQuestionsAnswers`, `subfrmListResourcesPlanning`, `subfrmListRisksIssuesTracker`, `subfrmListSuppliers`, `subfrmListTodoList`, `subfrmMeetingActionItems`, `subfrmMeetingAgenda`, `subfrmMeetingDiscussionPoints`, `subfrmMeetingParticipants`, `subfrmNotes`, `subfrmProjectExistingSystem`

## 2. Table schemas (data dictionary)

Suggested SQL Server type mapping is included per column (used by `db/migrations`).

### `tbl3rdPartySupplier` (12 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| SupplierID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| SupplierName | TEXT | 510 | var | NVARCHAR(255) |
| Contact Person | TEXT | 510 | var | NVARCHAR(255) |
| Email Address | TEXT | 510 | var | NVARCHAR(255) |
| Contract Start Date | DATETIME |  | fixed | DATETIME2 |
| Contract End Date | DATETIME |  | fixed | DATETIME2 |
| Rating | TEXT | 510 | var | NVARCHAR(255) |
| Address | TEXT | 510 | var | NVARCHAR(255) |
| Province or State | TEXT | 510 | var | NVARCHAR(255) |
| Country | TEXT | 510 | var | NVARCHAR(255) |
| Postal Code | TEXT | 510 | var | NVARCHAR(255) |
| City | TEXT | 510 | var | NVARCHAR(255) |

### `tblKeywords` (29 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| KeywordID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| Keyword | TEXT | 100 | var | NVARCHAR(255) |
| Definition | TEXT | 100 | var | NVARCHAR(255) |

### `tblActivityStatusType` (0 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| StatusID | LONG |  | fixed | INT |
| DailyActivityListID | LONG |  | fixed | INT |
| ActivityStatus | TEXT | 510 | var | NVARCHAR(255) |
| SortOrder | LONG |  | fixed | INT |

### `tblAssumptionsConstraints` (8 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| AssumptionsConstraintsID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| Type | TEXT | 510 | var | NVARCHAR(255) |
| AssumptionsConstraints | MEMO |  | var | NVARCHAR(MAX) |
| AssumptionsValidated | BOOL |  | fixed | BIT |
| Impact | TEXT | 510 | var | NVARCHAR(255) |
| Mitigation Plan | MEMO |  | var | NVARCHAR(MAX) |

### `tblDailyActivityList` (13 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| DailyActivityListID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| StatusID | LONG |  | fixed | INT |
| Requester | TEXT | 510 | var | NVARCHAR(255) |
| Task | MEMO |  | var | NVARCHAR(MAX) |
| MyActivity | MEMO |  | var | NVARCHAR(MAX) |
| Date | DATETIME |  | fixed | DATETIME2 |
| Comments | MEMO |  | var | NVARCHAR(MAX) |
| Attachment | COMPLEX |  | fixed | INT (FK to attachment table) |
| RequestDate | DATETIME |  | fixed | DATETIME2 |
| Status | TEXT | 510 | var | NVARCHAR(255) |
| CompleteDate | DATETIME |  | fixed | DATETIME2 |
| Contact Method | TEXT | 510 | var | NVARCHAR(255) |
| Time Spent | LONG |  | fixed | INT |
| Assigned To | TEXT | 510 | var | NVARCHAR(255) |
| Task Type | TEXT | 510 | var | NVARCHAR(255) |
| Progress | LONG |  | fixed | INT |

### `tblExistingSystemsInterfaces` (0 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| ExistSysIntID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| ExistSysInt | BOOL |  | fixed | BIT |
| Notes | MEMO |  | var | NVARCHAR(MAX) |
| Location | MEMO |  | var | NVARCHAR(MAX) |

### `tblFinancials` (2 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| FinancialID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| ProjectNumber | LONG |  | fixed | INT |
| Acquisation | TEXT | 510 | var | NVARCHAR(255) |
| GlGrandLivre | TEXT | 510 | var | NVARCHAR(255) |
| BudgetEnvelope | TEXT | 510 | var | NVARCHAR(255) |
| Budget | MONEY |  | fixed | MONEY |
| SpendBy | TEXT | 510 | var | NVARCHAR(255) |
| RecurrentFees | MONEY |  | fixed | MONEY |
| ContractTimeframe | TEXT | 510 | var | NVARCHAR(255) |

### `tblITResourcePlanning` (15 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| ITResourceID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| Resource | TEXT | 510 | var | NVARCHAR(255) |

### `tblITResourcePlanningDetails` (18 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| ResourcePlanningID | LONG |  | fixed | INT |
| ITResourceID | LONG |  | fixed | INT |
| DetailText | MEMO |  | var | NVARCHAR(MAX) |
| Needed | BOOL |  | fixed | BIT |

### `tblInterviewQuestionsAnswers` (12 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| QAID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| Question | MEMO |  | var | NVARCHAR(MAX) |
| Answer | MEMO |  | var | NVARCHAR(MAX) |
| Category | TEXT | 510 | var | NVARCHAR(255) |
| Priority | TEXT | 510 | var | NVARCHAR(255) |
| Assigned To | TEXT | 510 | var | NVARCHAR(255) |

### `tblKeyRequirementsDeliverable` (8 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| KeyReqDevID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| KeyReq | MEMO |  | var | NVARCHAR(MAX) |
| Deadline | DATETIME |  | fixed | DATETIME2 |
| Assigned To | LONG |  | fixed | INT |
| Priority | TEXT | 510 | var | NVARCHAR(255) |
| Status | TEXT | 510 | var | NVARCHAR(255) |

### `tblMeetingActionItems` (9 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| Action Item Id | LONG |  | fixed | INT |
| DiscussionID | LONG |  | fixed | INT |
| AgendaID | LONG |  | fixed | INT |
| Action | MEMO |  | var | NVARCHAR(MAX) |
| AssignedTo | LONG |  | fixed | INT |
| DueDate | DATETIME |  | fixed | DATETIME2 |

### `tblMeetingAgenda` (3 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| AgendaID | LONG |  | fixed | INT |
| Agenda Item | MEMO |  | var | NVARCHAR(MAX) |
| MeetingID | LONG |  | fixed | INT |

### `tblMeetingDiscussionPoints` (3 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| DiscussionItemID | LONG |  | fixed | INT |
| AgendaID | LONG |  | fixed | INT |
| DiscussionPoint | MEMO |  | var | NVARCHAR(MAX) |

### `tblMeetingParticipants` (8 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| Participant | LONG |  | fixed | INT |
| Meeting ID | LONG |  | fixed | INT |
| Apology | TEXT | 510 | var | NVARCHAR(255) |

### `tblNotes` (7 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| NoteID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| Title | TEXT | 510 | var | NVARCHAR(255) |
| Content | MEMO |  | var | NVARCHAR(MAX) |

### `tblParkingLotItems` (12 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| LotItemID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| ParkingLotItem | TEXT | 100 | var | NVARCHAR(255) |
| Participant | LONG |  | fixed | INT |
| IsStrikethrough | BOOL |  | fixed | BIT |

### `tblProjectFinancialDocuments` (9 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| DocumentID | LONG |  | fixed | INT |
| FinancialID | LONG |  | fixed | INT |
| IsRequired | BOOL |  | fixed | BIT |
| ReasonNotCreated | MEMO |  | var | NVARCHAR(MAX) |

### `tblProjectFramework` (18 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| ProjectID | LONG |  | fixed | INT |
| ProjectName | TEXT | 510 | var | NVARCHAR(255) |
| ProjectManager | TEXT | 510 | var | NVARCHAR(255) |
| BusinessAnalyst | TEXT | 510 | var | NVARCHAR(255) |
| ProjectDocs | MEMO |  | var | NVARCHAR(MAX) |
| ProjectSponsor | TEXT | 510 | var | NVARCHAR(255) |
| DateOfProject | DATETIME |  | fixed | DATETIME2 |
| ProblemStatement | MEMO |  | var | NVARCHAR(MAX) |
| CurrentState | MEMO |  | var | NVARCHAR(MAX) |
| FutureState | MEMO |  | var | NVARCHAR(MAX) |
| UserImpact | MEMO |  | var | NVARCHAR(MAX) |
| Mandate | TEXT | 510 | var | NVARCHAR(255) |
| ProjectStatusCom | MEMO |  | var | NVARCHAR(MAX) |
| ExistBusMod | TEXT | 510 | var | NVARCHAR(255) |
| A1 | BOOL |  | fixed | BIT |
| DA | BOOL |  | fixed | BIT |
| DAS | BOOL |  | fixed | BIT |
| PurchaseOrder | BOOL |  | fixed | BIT |
| Requisition | BOOL |  | fixed | BIT |
| DO | BOOL |  | fixed | BIT |
| FinancingSource | TEXT | 510 | var | NVARCHAR(255) |
| FinancingCost | MONEY |  | fixed | MONEY |
| Recurrent Cost | MONEY |  | fixed | MONEY |
| PurchaseEquipment | BOOL |  | fixed | BIT |
| EquipmentNotes | MEMO |  | var | NVARCHAR(MAX) |
| StartDate | DATETIME |  | fixed | DATETIME2 |
| EndDate | DATETIME |  | fixed | DATETIME2 |
| SimilarProject | BOOL |  | fixed | BIT |

### `tblProjectObjectives` (6 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| ProjectObjID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| QMeasurable | TEXT | 510 | var | NVARCHAR(255) |
| QSuccess | MEMO |  | var | NVARCHAR(MAX) |
| QAlignmentStrategy | TEXT | 510 | var | NVARCHAR(255) |
| ProjectObjectives | MEMO |  | var | NVARCHAR(MAX) |

### `tblProjectSummary` (0 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| ProjectSummaryID | LONG |  | fixed | INT |
| ProjectName | TEXT | 510 | var | NVARCHAR(255) |
| TaskRequested | MEMO |  | var | NVARCHAR(MAX) |
| DailyItemsID | LONG |  | fixed | INT |
| Deliverable | MEMO |  | var | NVARCHAR(MAX) |
| FollowUpActions | TEXT | 510 | var | NVARCHAR(255) |
| StartDate | DATETIME |  | fixed | DATETIME2 |
| EndDate | DATETIME |  | fixed | DATETIME2 |
| Status | TEXT | 510 | var | NVARCHAR(255) |
| Resource/Responsible | TEXT | 510 | var | NVARCHAR(255) |
| Documentation | COMPLEX |  | fixed | INT (FK to attachment table) |
| Comments | MEMO |  | var | NVARCHAR(MAX) |

### `tblProjectTask` (0 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| ProjectOrTask | TEXT | 510 | var | NVARCHAR(255) |
| DateCreatedInSystem | DATETIME |  | fixed | DATETIME2 |

### `tblProjectTaskList` (0 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| ProjectOrTask | TEXT | 510 | var | NVARCHAR(255) |

### `tblRisksIssuesTracker` (2 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| RiskIssueID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| Description | MEMO |  | var | NVARCHAR(MAX) |
| Category | TEXT | 510 | var | NVARCHAR(255) |
| Date Identified | DATETIME |  | fixed | DATETIME2 |
| Status | TEXT | 510 | var | NVARCHAR(255) |
| Priority | TEXT | 510 | var | NVARCHAR(255) |
| Impact | TEXT | 510 | var | NVARCHAR(255) |
| Probability | TEXT | 510 | var | NVARCHAR(255) |
| Mitigation Plan | MEMO |  | var | NVARCHAR(MAX) |
| Owner | TEXT | 510 | var | NVARCHAR(255) |
| Due date | DATETIME |  | fixed | DATETIME2 |

### `tblStakeholders` (8 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| StakeholderID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| FirstName | TEXT | 510 | var | NVARCHAR(255) |
| LastName | TEXT | 510 | var | NVARCHAR(255) |
| DepartmentOrganization | TEXT | 510 | var | NVARCHAR(255) |
| ProjectRole | TEXT | 510 | var | NVARCHAR(255) |
| Role Description | TEXT | 510 | var | NVARCHAR(255) |
| PhoneNumber | TEXT | 510 | var | NVARCHAR(255) |
| Ext# | TEXT | 510 | var | NVARCHAR(255) |
| Mobile | TEXT | 510 | var | NVARCHAR(255) |
| Email Address | TEXT | 510 | var | NVARCHAR(255) |
| PhysicalLocation | TEXT | 510 | var | NVARCHAR(255) |
| Org Title | TEXT | 510 | var | NVARCHAR(255) |
| Communication Preference | TEXT | 510 | var | NVARCHAR(255) |
| Engagement Level | TEXT | 510 | var | NVARCHAR(255) |
| AdditionalNotes | MEMO |  | var | NVARCHAR(MAX) |

### `tblTaskFramework` (0 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| TaskName | TEXT | 510 | var | NVARCHAR(255) |
| ProjectOrTask | TEXT | 510 | var | NVARCHAR(255) |
| TaskRequested | MEMO |  | var | NVARCHAR(MAX) |
| TaskRequestByWho | TEXT | 510 | var | NVARCHAR(255) |
| ExpectedDate | DATETIME |  | fixed | DATETIME2 |
| CurrentDate | DATETIME |  | fixed | DATETIME2 |

### `tblTodoList` (16 rows)

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| TodoItemId | LONG |  | fixed | INT |
| ProjectActivityID | LONG |  | fixed | INT |
| ProjectOrActivity | TEXT | 510 | var | NVARCHAR(255) |
| TodoItem | TEXT | 510 | var | NVARCHAR(255) |
| StartDate | DATETIME |  | fixed | DATETIME2 |
| DueDate | DATETIME |  | fixed | DATETIME2 |
| Priority | TEXT | 510 | var | NVARCHAR(255) |
| Status | TEXT | 510 | var | NVARCHAR(255) |
| Notes | MEMO |  | var | NVARCHAR(MAX) |
| IsAlert | BOOL |  | fixed | BIT |
| AlertDay | DATETIME |  | fixed | DATETIME2 |
| AlertTime | DATETIME |  | fixed | DATETIME2 |
| RepeatUnit | TEXT | 510 | var | NVARCHAR(255) |
| RepeatInterval | LONG |  | fixed | INT |
| CurrentRepeatInterval | LONG |  | fixed | INT |
| SnoozeCount | LONG |  | fixed | INT |
| LastSnoozeTime | DATETIME |  | fixed | DATETIME2 |
| MaxSnoozeCount | LONG |  | fixed | INT |
| SnoozeOptions | TEXT | 510 | var | NVARCHAR(255) |
| IsDismissed | BOOL |  | fixed | BIT |

### `tblMeetingMinutes` (5 rows) *(recovered — deleted-flagged slot, still live per mdbtools)*

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| MeetingMinutesID | LONG |  | fixed | INT |
| ProjectID | LONG |  | fixed | INT |
| Subject | TEXT | 510 | var | NVARCHAR(255) |
| Description | MEMO |  | var | NVARCHAR(MAX) |
| Location | TEXT | 510 | var | NVARCHAR(255) |
| StartDate | DATETIME |  | fixed | DATETIME2 |
| StartTime | DATETIME |  | fixed | DATETIME2 |
| EndTime | DATETIME |  | fixed | DATETIME2 |
| Conclusion | MEMO |  | var | NVARCHAR(MAX) |
| NextMeeting | DATETIME |  | fixed | DATETIME2 |
| FollowupAction | TEXT | 510 | var | NVARCHAR(255) |

### `tblFinancialDocuments` (9 rows) *(recovered — the MSSS document-type lookup)*

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| DocumentID | LONG |  | fixed | INT |
| DocumentType | TEXT | 510 | var | NVARCHAR(255) |

### `Switchboard Items` (0 rows) *(recovered — standard Access switchboard artefact; not migrated)*

| Column | Access type | Size (bytes, UTF-16) | Storage | SQL Server type |
|---|---|---|---|---|
| SwitchboardID | LONG |  | fixed | INT |
| ItemNumber | INT |  | fixed | SMALLINT |
| ItemText | TEXT | 510 | var | NVARCHAR(255) |
| Command | INT |  | fixed | SMALLINT |
| Argument | TEXT | 510 | var | NVARCHAR(255) |

### Attachment (complex-column) side tables

Access 2010 attachment columns are stored in hidden `f_*` tables (from `MSysComplexColumns`):

| Attachment column | Hidden storage table | Owning table |
|---|---|---|
| Data | f_3E3EC6ED2D6141538654E4E37770C497_Data | MSysResources |
| Attachment | f_10A507954BDC4AED8B2702AD9617E985_Attachment | tblDailyActivityList |
| Documentation | f_18D99D0B9F2B4EF79FCE40B6F0C89337_Documentation | tblProjectSummary |

## 3. Relationships (MSysRelationships, 28 rows)

`grbit` flags: `0x0` = enforced RI, `0x1000000` (16777216) = left-join display, `0x2` = don't enforce, `0x100` = cascade update, `0x1000` = cascade delete.

| Child table | Child column |  | Parent table | Parent column | grbit |
|---|---|---|---|---|---|
| tblMeetingMinutes | ProjectID | → | tblProjectFramework | ProjectID | 16777216 |
| tblKeywords | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblExistingSystemsInterfaces | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblProjectObjectives | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblAssumptionsConstraints | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblStakeholders | ProjectID | → | tblProjectFramework | ProjectID | 16777216 |
| tbl3rdPartySupplier | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblInterviewQuestionsAnswers | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblKeyRequirementsDeliverable | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblTodoList | ProjectActivityID | → | tblDailyActivityList | DailyActivityListID | 2 |
| tblProjectFinancialDocuments | DocumentID | → | tblFinancialDocuments | DocumentID | 257 |
| tblProjectFinancialDocuments | DocumentID | → | tblFinancialDocuments | DocumentID | 257 |
| tblProjectFinancialDocuments | FinancialID | → | tblFinancials | FinancialID | 256 |
| tblITResourcePlanningDetails | ITResourceID | → | tblITResourcePlanning | ITResourceID | 0 |
| tblMeetingActionItems | AgendaID | → | tblMeetingAgenda | AgendaID | 0 |
| tblMeetingDiscussionPoints | AgendaID | → | tblMeetingAgenda | AgendaID | 0 |
| tblMeetingActionItems | DiscussionID | → | tblMeetingDiscussionPoints | DiscussionItemID | 0 |
| tblMeetingAgenda | MeetingID | → | tblMeetingMinutes | MeetingMinutesID | 0 |
| tblMeetingActionItems | AssignedTo | → | tblMeetingParticipants | Participant | 2 |
| tblDailyActivityList | ProjectID | → | tblProjectFramework | ProjectID | 2 |
| tblFinancials | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblITResourcePlanning | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblNotes | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblParkingLotItems | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblRisksIssuesTracker | ProjectID | → | tblProjectFramework | ProjectID | 0 |
| tblTodoList | ProjectActivityID | → | tblProjectFramework | ProjectID | 2 |

> ~~**Orphaned relationships:** `tblMeetingMinutes` and `tblFinancialDocuments` appear as relationship endpoints but no longer exist as tables~~ **Correction (verification pass):** both tables DO exist — their MSysObjects slots are deleted-flagged but the tables are live (mdbtools lists and exports them; schemas and data above/below). The relationship chains `tblMeetingMinutes → tblMeetingAgenda → …` and `tblFinancials/tblFinancialDocuments → tblProjectFinancialDocuments` are therefore fully intact: `tblProjectFinancialDocuments` is the junction between `tblFinancials` and the `tblFinancialDocuments` document-type lookup.

## 4. Full data export (all rows, all user tables)

### `tbl3rdPartySupplier` — 12 rows

| SupplierID | ProjectID | SupplierName | Contact Person | Email Address | Contract Start Date | Contract End Date | Rating | Address | Province or State | Country | Postal Code | City |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | Fiverr Company |  |  |  |  |  |  |  |  |  |  |
| 2 | 2 | Upwork |  |  |  |  |  |  |  |  |  |  |
| 3 | 2 | Homework Project |  |  |  |  |  |  |  |  |  |  |
| 4 | 14 | New Supplier |  |  |  |  |  |  |  |  |  |  |
| 5 | 23 | I am a supplier |  |  |  |  |  |  |  |  |  |  |
| 6 | 2 | New Supplier |  |  |  |  |  |  |  |  |  |  |
| 11 | 2 | Suppli |  |  |  |  |  |  |  |  |  |  |
| 12 | 2 | SupplierName |  |  |  |  |  |  |  |  |  |  |
| 13 | 26 | GTI Distributors | Eunice Taylor | info@gtidistributors.com | 2024-12-26 00:00:00 | 2024-12-17 00:00:00 | Excellent | 617 Annex Avenue |  | Canada | 87680 | Toronto |
| 14 | 26 | Pioneer Trust Limited | Tom Hughes | pioneertraders@yahoo.com | 2024-12-24 00:00:00 | 2025-01-11 00:00:00 | Good | 26 Trunk Rd | Maharashtra | India | 400012 | Mumbai |
| 16 | 1 | new |  |  |  |  |  |  |  |  |  |  |
| 17 | 1 | new |  |  |  |  |  |  |  |  |  |  |

### `tblKeywords` — 29 rows

| KeywordID | ProjectID | Keyword | Definition |
|---|---|---|---|
| 2 | 1 | DB | Database |
| 3 | 2 | DB | Database |
| 7 | 2 | WS | Web Service |
| 8 | 2 | ADS | About Doing Something |
| 9 | 2 | Cr | Credit |
| 10 | 2 | Db | Debit |
| 12 | 2 | ABS | Anti Locking System |
| 13 | 2 | New | NEWWWW |
| 14 | 2 | acn | Keyword |
| 16 | 2 | CAN | Calcium ammonium Nitrate |
| 17 | 2 | Can | calcium ammonium nitrate |
| 18 | 2 | AC | Keyword |
| 19 |  | AC | Keyword |
| 20 | 6 | new | Keyword |
| 21 |  | AC | Keyword |
| 22 | 8 | AC | Keyword |
| 23 |  | hey | new |
| 24 | 9 | AC | Keyword |
| 25 | 14 | AC | Keyword |
| 26 | 14 | It worked |  |
| 27 | 15 | AC | Keyword |
| 28 | 20 | Me | Too |
| 29 | 1 | AC | Keyword |
| 30 | 2 | NEWC | New Keyword |
| 31 | 26 | AC | Keyword |
| 32 | 26 | AD | Advertisement |
| 33 | 26 | US | United States |
| 34 | 26 | CA | Canada |
| 35 | 26 | KE | Kenya |

### `tblActivityStatusType` — 0 rows

_(empty table)_

### `tblAssumptionsConstraints` — 8 rows

| AssumptionsConstraintsID | ProjectID | Type | AssumptionsConstraints | AssumptionsValidated | Impact | Mitigation Plan |
|---|---|---|---|---|---|---|
| 1 | 2 | Constraint | I will make it on time | True |  |  |
| 2 | 2 | Assumption | Is this constraint validated? | False |  |  |
| 3 | 2 | Assumption | This ia an assumption | True |  |  |
| 4 | 2 | Assumption | My first assumption edited | True |  |  |
| 5 | 2 | Assumption | Assumption | True |  |  |
| 6 | 2 | Constraint | Constraint | False |  |  |
| 7 | 2 | Assumption | Assumption and Constraint | True | High |  |
| 8 | 2 |  | New | False |  |  |

### `tblDailyActivityList` — 13 rows

| DailyActivityListID | ProjectID | StatusID | Requester | Task | MyActivity | Date | Comments | Attachment | RequestDate | Status | CompleteDate | Contact Method | Time Spent | Assigned To | Task Type | Progress |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | 0 | Borton | Hello, kindly let us meet today evening |  |  |  | 1 | 2024-12-14 00:00:00 | Active |  | Questions I have |  |  |  |  |
| 2 | 2 | 0 | Borton | Forms Editing | Continue with editing forms | 2025-02-20 00:00:00 | Need to work extra fast | 2 | 2024-12-14 00:00:00 | Pending |  | Questions I have |  |  |  |  |
| 3 | 2 | 0 | Prius | Relink Database tables | Hello, kindly let us meet today evening |  |  | 3 | 2024-10-08 00:00:00 | Urgent |  | Meeting |  |  |  |  |
| 4 | 1 | 0 | Marin | Try to use it and see how it works | Looks like a cool thing to try it | 2024-12-16 00:00:00 |  | 4 | 2024-12-15 00:00:00 | Pending |  | In Person |  |  |  |  |
| 5 | 1 | 0 | James | Work on remaining reports that are incomplete | Checked if they are working, but not all are working | 2024-12-17 00:00:00 |  | 5 | 2024-12-14 00:00:00 | Pending |  | Text Message |  |  |  |  |
| 6 | 1 | 0 |  |  |  |  |  | 6 |  |  |  |  |  |  |  |  |
| 7 | 2 | 0 | Andrew | Create a crypto token landing page using nextjs |  |  |  | 7 | 2024-12-17 00:00:00 | Active |  | Telephone |  |  |  |  |
| 8 | 3 | 0 |  |  |  |  |  | 8 |  |  |  |  |  |  |  |  |
| 9 | 2 | 0 |  |  |  |  |  | 9 |  |  |  |  |  |  |  |  |
| 10 | 2 | 0 |  |  |  |  |  | 10 |  |  |  |  |  |  |  |  |
| 11 | 2 | 0 | James | Assign all objects | None | 2024-12-29 00:00:00 |  | 20 | 2024-12-27 00:00:00 | Not in List |  | Telephone |  |  |  |  |
| 12 | 27 | 0 |  |  |  |  |  | 31 |  |  |  |  | 0 |  |  | 0 |
| 13 | 25 | 0 | Borton | Check why Add Activity throws an error | Debug the form to ensure it does not throw the error, and user can add daily activity easily | 2025-01-01 00:00:00 |  | 42 | 2024-12-31 00:00:00 | Pending |  | To do | 1 | 1 | Technical | 50 |

### `tblExistingSystemsInterfaces` — 0 rows

_(empty table)_

### `tblFinancials` — 2 rows

| FinancialID | ProjectID | ProjectNumber | Acquisation | GlGrandLivre | BudgetEnvelope | Budget | SpendBy | RecurrentFees | ContractTimeframe |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | 1018732 | Qualite Prix | A1-12345 | PMT EIRI | 100000.0 | Payment for the full year | 900000.0 | 3 years - 2 options |
| 2 | 2 | 0 | Acquisation | GL Grand | Budget Envelope | 10000.0 | 3 months min | 3000.0 | 3 years |

### `tblITResourcePlanning` — 15 rows

| ITResourceID | ProjectID | Resource |
|---|---|---|
| 1 | 2 | IT Security |
| 2 | 2 | User Training |
| 3 | 2 | IT Interfaces |
| 5 | 2 | IT Local Techs |
| 6 | 2 | IT Infrasturcture |
| 7 | 2 | New Resource |
| 8 | 1 | IT Interfaces |
| 10 | 3 | IT Interface |
| 11 | 1 | IT Infrastructure |
| 12 | 1 | User Training |
| 13 | 1 | IT Local Tech |
| 14 | 1 | IT Security |
| 15 | 14 | IT Infrastructure |
| 16 | 2 | Resource Test |
| 17 | 2 | New Resource |

### `tblITResourcePlanningDetails` — 18 rows

| ResourcePlanningID | ITResourceID | DetailText | Needed |
|---|---|---|---|
| 1 | 1 | Does this system need to be vetted by security? What needs to be added for Security in the Devis Techniques | True |
| 2 | 2 | Who are the users needed to be trained? | True |
| 3 | 2 | What do the users need to be trained on? | False |
| 4 | 3 | Does this system require an interface? | True |
| 5 | 5 | <div>Does the technicians need to be trained on the new system?</div> | False |
| 6 | 6 | <div>Does this require a greater capacity on our infrastructure?</div> | False |
| 7 | 7 | <div>This is a detail on new it resource</div> | False |
| 8 | 8 | <div>Does this system need an interface?</div> | True |
| 9 | 10 | <div>Does this system need an interface?</div> | True |
| 10 | 10 | <div>T<u>his </u>field support <strong>rich </strong>text <font<br>face="Arial Rounded MT Bold" size=5><em>editing</em></font></div> | False |
| 11 | 11 | <div>Does this require a greater capacity on our infrastructure?</div> | True |
| 12 | 12 | <div>Who are the users who need to be trained?</div> | True |
| 13 | 12 | <div>What do the users need to be trained on?</div> | True |
| 14 | 13 | <div>Do the technicians need to be trained on the new system?</div> | False |
| 15 | 14 | <div>Does this system need to be vetted by security?</div> | True |
| 16 | 14 | <div>What needs to be added for security in Devis Technique?</div> | False |
| 17 | 15 | <div>Does this need new systems?</div> | False |
| 18 | 16 | <div>Do we need it?</div> | True |

### `tblInterviewQuestionsAnswers` — 12 rows

| QAID | ProjectID | Question | Answer | Category | Priority | Assigned To |
|---|---|---|---|---|---|---|
| 1 | 2 | How soon can you complete the Notes section? | by 20th it will be done and dusted |  |  |  |
| 2 | 2 | I need a little work done, are you available? | Yes, apart from this there is nothing else important I am doing |  |  |  |
| 4 | 2 | Hey | Yes |  |  |  |
| 5 | 2 | Another Question | I am answering it |  |  |  |
| 6 | 2 | Yet another question | Answered not yet |  |  |  |
| 7 | 2 | Question | Answer |  |  |  |
| 8 | 2 | Another question | Another answer |  |  |  |
| 9 | 14 | Question | Answer |  |  |  |
| 10 |  | Question | Answer |  |  |  |
| 11 |  | Question | Answer |  |  |  |
| 12 | 22 | Question | Yes |  |  |  |
| 13 | 2 | Question | Answer |  |  |  |

### `tblKeyRequirementsDeliverable` — 8 rows

| KeyReqDevID | ProjectID | KeyReq | Deadline | Assigned To | Priority | Status |
|---|---|---|---|---|---|---|
| 1 | 2 | 12.1-The system must allow for the content to have a strikethrough. | 2024-12-25 00:00:00 | 3 | Important | Pending |
| 2 | 2 | 13.2-The systems "To do list" is made up of Daily task line items that can be arranged in any order. |  |  |  |  |
| 3 | 2 | 5.1 The system dropdown "Person Responsible" should be generated from the stakeholder list in the project. |  |  |  |  |
| 4 | 2 | 0.2-The system must have a responsive field where the actor can type the beginning of the project name and it will find the name in the drop down list. |  |  |  |  |
| 5 |  | new |  |  |  |  |
| 6 | 2 | New Key Requirement Deliverable |  |  |  |  |
| 7 | 24 | Fast reports generation | 2024-12-26 00:00:00 | 5 | Important | In Progress |
| 8 | 1 |  |  |  |  |  |

### `tblMeetingActionItems` — 9 rows

| Action Item Id | DiscussionID | AgendaID | Action | AssignedTo | DueDate |
|---|---|---|---|---|---|
| 1 | 1 | 1 | Crisis prevention orders | 6 |  |
| 2 | 1 | 1 | Increasing orders to meet a target requirement | 6 |  |
| 3 | 1 | 1 | Decreasing orders to meet container capacities | 6 |  |
| 4 | 1 | 1 | Cycle counting, reconciling count discrepancies | 6 |  |
| 5 | 2 | 2 | Appropriate forecast period | 5 |  |
| 6 | 2 | 2 | Analyzing past usage | 5 |  |
| 7 | 2 | 2 | Trends | 5 |  |
| 8 | 2 | 2 | Collaborative forecast | 5 |  |
| 9 | 2 | 2 | Appropriate forecast horizon | 5 |  |

### `tblMeetingAgenda` — 3 rows

| AgendaID | Agenda Item | MeetingID |
|---|---|---|
| 1 | Effective replenishment processing | 2 |
| 2 | Demand forecasting | 2 |
| 3 | Fill stock quantity replenishment |  |

### `tblMeetingDiscussionPoints` — 3 rows

| DiscussionItemID | AgendaID | DiscussionPoint |
|---|---|---|
| 1 | 1 | Safety stock quantities |
| 2 | 2 | Forecasting items with recurring usage |
| 3 | 3 | Economic order quantities. |

### `tblMeetingParticipants` — 8 rows

| Participant | Meeting ID | Apology |
|---|---|---|
| 1 | 0 | Attendee |
| 1 | 1 | Attendee |
| 2 | 0 | Apology |
| 2 | 1 | Attendee |
| 3 | 1 | Apology |
| 4 | 2 | Attendee |
| 5 | 2 | Apology |
| 6 | 2 | Attendee |

### `tblNotes` — 7 rows

| NoteID | ProjectID | Title | Content |
|---|---|---|---|
| 7 | 2 | New Notes | I have some notes here |
| 8 | 2 | Note 6 | New changes made here |
| 9 | 2 | Note 7 | Made changes |
| 10 | 2 | Note 8 |  |
| 11 | 2 |  | I have some notes here |
| 12 | 1 |  | I have some notes here |
| 13 | 1 | ProjectsNote |  |

### `tblParkingLotItems` — 12 rows

| LotItemID | ProjectID | ParkingLotItem | Participant | IsStrikethrough |
|---|---|---|---|---|
| 3 | 2 | 1- Per Mustapha of IT: The DME must be able to con | 1 | True |
| 5 | 2 | 2- Ambulatory clinical services, how many people d | 1 | False |
| 6 | 2 | What is the GMF-U we must account for in this proj | 1 | True |
| 7 | 2 | Did we renew the contract for GMF-U Myle at St-Mar | 2 | True |
| 8 | 2 | Add a patient portal to the requirements? (what re | 1 | True |
| 9 | 2 | Add Oacis to the requirements, bi-directional with | 2 | True |
| 10 | 2 | 7-Standard delay of 2 weeks once she has a static  | 1 | True |
| 11 | 2 | 8-Cost of the personnel who will be on the selecti | 2 | True |
| 12 | 2 | 9-Speak with Archive for requirements | 2 | False |
| 13 | 2 | 10-Who must read and sign off, Catherine Haskins,  | 1 | False |
| 14 | 2 | Parking Lot Item | 2 | True |
| 15 | 2 | New | 1 | True |

### `tblProjectFinancialDocuments` — 9 rows

| DocumentID | FinancialID | IsRequired | ReasonNotCreated |
|---|---|---|---|
| 1 | 1 | False | The cost is considered non-capitalizable |
| 2 | 1 | False | The cost is considered non-capitalizable |
| 3 | 1 | True |  |
| 4 | 1 | False |  |
| 5 | 1 | False |  |
| 6 | 1 | True |  |
| 7 | 1 | True |  |
| 8 | 1 | False |  |
| 9 | 1 | True |  |

### `tblProjectFramework` — 18 rows

| ProjectID | ProjectName | ProjectManager | BusinessAnalyst | ProjectDocs | ProjectSponsor | DateOfProject | ProblemStatement | CurrentState | FutureState | UserImpact | Mandate | ProjectStatusCom | ExistBusMod | A1 | DA | DAS | PurchaseOrder | Requisition | DO | FinancingSource | FinancingCost | Recurrent Cost | PurchaseEquipment | EquipmentNotes | StartDate | EndDate | SimilarProject |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Platform migraation | Saeol |  |  | Amareez | 2024-12-12 00:00:00 | Manual onboarding leads to delays | Manual workflows | Automated onboarding platform | High | Improve efficiency | Planning | No | True | True | False | False | False | True |  | 70.0 | 90.0 | True |  | 2024-12-12 00:00:00 | 2024-12-30 00:00:00 | False |
| 2 | Upgrade Inventory Management | Saeol |  |  | Borton | 2024-12-14 00:00:00 | Inventory discrepancies | No reports, some forms missing | All reports done, same as all forms done well | medium | Achieve the best version possible | Completed |  | True | False | False | True | True | False | Unknown | 500.0 | 0.0 | False | Complete the project with all details discussed done | 2024-12-13 00:00:00 | 2024-12-28 00:00:00 | False |
| 3 | Generate landing page using Bolt AI |  |  |  |  | 2024-12-15 00:00:00 | Lack of AI-driven automation | No reports, forms missing | Accurate and synced inventory | Low | Reduce errors | In Progress |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  | 2024-12-23 00:00:00 | 2024-12-24 00:00:00 | False |
| 4 | IT Service Desk Overhaul |  |  |  |  | 2024-12-27 00:00:00 | Long resolution times | Manual web creation | Ai-Assisted web generation | High | Adopt new tech trends | Not Started |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 5 | Mobile App Performance Testing |  |  |  |  | 2024-12-27 00:00:00 | Poor mobile app performance | Outdated ticketing system | Modern serl-service desk | High | Enhance user support | Not Started |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 6 | New Network Configuration |  |  |  |  | 2024-12-27 00:00:00 | Network outages causing disruptions | Minimal load testing | Optimized app perfomance | High | Increase app adoption | Planning |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 8 | Vendor Management System Update | Lisa White | Mike Brown |  | Jared Smith | 2024-12-27 00:00:00 |  |  |  |  |  |  |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 9 | Internal Collaboration Tool | Project |  |  |  | 2024-12-27 00:00:00 |  |  |  |  |  |  |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 14 | Data Backup Enhancement | Yes, I don’琀 | Analyst |  | Sponsor | 2024-12-26 00:00:00 | Problem or Opportunity |  |  |  |  |  |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 15 | System Integration Testing | Manager | Analyst |  | Sponsor | 2024-12-27 00:00:00 | Problem was "You tried to assign the NULL value to a variable that is not a Variant data type." | I think it is solved | It will be solved |  |  |  |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 20 | New Employee Training Module |  |  |  |  | 2024-12-27 00:00:00 |  |  |  |  |  |  |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 22 | Software Quality Assurance |  |  |  |  | 2024-12-27 00:00:00 |  |  |  |  |  |  |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 23 | Marketing Automation Setup |  |  |  |  | 2024-12-27 00:00:00 |  |  |  |  |  |  |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 24 | Data warehouse optimization | Anna bell | Lisa Chen |  | David Walker | 2024-12-30 00:00:00 | Slow data queries are impacting reporting | Fragmented data sources | Optimized central data warehouse |  | Normalize data |  |  | True | True | True | True | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 25 | Migration to Cloud | Michael Lee | Andrew Skipp |  | Simon Keep | 2024-12-30 00:00:00 |  |  |  |  |  |  |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 26 | Marketing Automation Setup | David James |  |  |  | 2024-12-30 00:00:00 |  |  |  |  |  |  |  | False | False | False | False | False | False |  | 0.0 | 0.0 | False |  |  |  | False |
| 27 | Students NEMIS Update | Tifamovs Saeol | Frank Kiogora |  | Martin Nyaga | 2024-12-30 00:00:00 | Optimize system to reduce time taken for user aunthentication | Takes time to aunthenticate users using biometrics | Easier facial or thumb recognition |  |  |  |  | False | False | False | False | False | False | CDF | 7000.0 | 850.0 | False |  | 2024-12-01 00:00:00 | 2025-01-31 00:00:00 | False |
| 28 | Migraation | anne |  |  | will | 2025-01-05 00:00:00 |  |  |  |  |  |  |  | True | False | True | True | True | False |  | 90.0 | 60.0 | True |  | 2025-01-01 00:00:00 | 2025-01-08 00:00:00 | False |

### `tblProjectObjectives` — 6 rows

| ProjectObjID | ProjectID | QMeasurable | QSuccess | QAlignmentStrategy | ProjectObjectives |
|---|---|---|---|---|---|
| 1 | 2 | Yes | Yes | Yes | 13.2-The systems "To do list" is made up of Daily task line items that can be arranged in any order. |
| 2 | 2 | Yes | Yes | Yes | This is my second project objective |
| 3 | 2 | Yes | Yes | Yes | This is a third objective that I have edited |
| 4 | 14 |  |  |  | Objective |
| 5 | 2 | Yes | Yes | Yes | New Objective |
| 6 | 1 |  |  |  |  |

### `tblProjectSummary` — 0 rows

_(empty table)_

### `tblProjectTask` — 0 rows

_(empty table)_

### `tblProjectTaskList` — 0 rows

_(empty table)_

### `tblRisksIssuesTracker` — 2 rows

| RiskIssueID | ProjectID | Description | Category | Date Identified | Status | Priority | Impact | Probability | Mitigation Plan | Owner | Due date |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | <div>Adding risk/issues raises an error in the code, project id was missing</div> | Issue | 2024-12-31 00:00:00 | Closed | High | Low | High | <div>Rename the relevant field to ProjectID </div> |  | 2024-12-31 00:00:00 |
| 2 | 2 | <div>Clicking &quot;New Item&quot; in Finanacials takes user to parking lot items</div> | Issue | 2024-12-31 00:00:00 | In Progress | High |  | High | <div>Change the code to open financials entry instead of opening parking lot items</div> |  | 2024-12-31 00:00:00 |

### `tblStakeholders` — 8 rows

| StakeholderID | ProjectID | FirstName | LastName | DepartmentOrganization | ProjectRole | Role Description | PhoneNumber | Ext# | Mobile | Email Address | PhysicalLocation | Org Title | Communication Preference | Engagement Level | AdditionalNotes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | Gary | Cantrall | Organization and efficiency | Developer |  | +1 561 6718 677 | 166 | 89766780 |  | Aus | Software Engineer | Email | Medium |  |
| 2 | 2 | Stakeholder Firstname | Stakeholder lastname | Workstyl |  |  |  |  |  |  |  | Product Designer |  |  |  |
| 3 | 2 | Test2Firstname | Test2lastname |  |  |  |  |  |  |  |  |  |  |  |  |
| 4 | 24 | Stakeholder fname | Stakeholder lnam | DptOrg | Role |  | Tel | 676 | 70181888 |  | Physical Location | OrgTitle |  |  | Notes |
| 5 | 24 | Tome | Green | Datafire Technologies | Optimize database |  | +1 (678) 787-8919 | 767 | 897 675 7865 |  | Toronto, Canada | Database designer |  |  |  |
| 6 | 24 | Lucy | Taylor | High Cloud Services | Cloud Architect |  | +1 (454) 617-8181 | 765 | 087 617 1717 |  | New York, United States | Developer |  |  |  |
| 7 | 26 | Karen | Johnson | Nate's Designers | Analyst |  | +1 (786) 766-9191 | 817 | 919 818 1717 |  | Chicago | Product Designer |  |  |  |
| 9 | 27 | Ministry of Education, Science and Technology |  | Kenyan Government |  |  |  |  |  |  | Nairobi | ICT Authority |  |  |  |

### `tblTaskFramework` — 0 rows

_(empty table)_

### `tblTodoList` — 16 rows

| TodoItemId | ProjectActivityID | ProjectOrActivity | TodoItem | StartDate | DueDate | Priority | Status | Notes | IsAlert | AlertDay | AlertTime | RepeatUnit | RepeatInterval | CurrentRepeatInterval | SnoozeCount | LastSnoozeTime | MaxSnoozeCount | SnoozeOptions | IsDismissed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 14 | Project | Create purchase orders table and queries | 2024-12-27 00:00:00 | 2024-12-24 00:00:00 | High | Not Started |  | True | 2025-01-05 00:00:00 | 1899-12-30 02:36:00 | Hour | 2 | 45 | 0 | 2025-10-07 17:09:43 | 5 | 5 | False |
| 4 | 7 | Daily Activity | Another To do Item | 2024-12-27 00:00:00 | 2024-12-30 00:00:00 | Critical | In Progress |  | True | 2025-01-05 00:00:00 | 1899-12-30 08:20:00 | Hour | 2 | 45 | 0 | 2025-10-07 17:09:43 | 5 | 15 | False |
| 6 | 24 | Project | Not Started | 2024-12-27 00:00:00 | 2024-12-31 00:00:00 | Medium | In Review |  | False |  |  |  |  |  |  |  |  |  | False |
| 10 | 7 | Daily Activity | New To do Item | 2024-12-28 00:00:00 | 2024-12-23 00:00:00 | Critical | Completed |  | False |  |  |  |  |  |  |  |  |  | False |
| 11 | 2 | Project | Relink new | 2024-12-28 00:00:00 | 2024-12-29 00:00:00 | Low | Cancelled |  | False |  |  |  |  |  |  |  |  |  | False |
| 12 | 2 | Project | New todo meet today eveing | 2024-12-28 00:00:00 | 2024-12-30 00:00:00 | Medium | Cancelled |  | False |  |  |  |  |  |  |  |  |  | False |
| 13 | 8 | Project | Edit Forms | 2024-12-28 00:00:00 | 2024-12-30 00:00:00 | High | Not Started |  | False |  |  |  |  |  |  |  |  |  | False |
| 15 | 2 | Project | Backup all of my data especially proejects I am currently working on | 2024-12-30 00:00:00 | 2024-12-31 00:00:00 | Critical | Not Started |  | False |  |  |  |  |  |  |  |  |  | False |
| 20 | 15 | Project | Test if the custom frontend works with the backend | 2024-12-31 00:00:00 | 2024-12-31 00:00:00 | Medium | In Progress |  | False |  |  |  | 0 |  |  |  |  |  | False |
| 21 | 2 | Daily Activity | Edit budget-tracking excel forms | 2024-12-24 00:00:00 | 2024-12-31 00:00:00 | Medium | In Progress |  | True | 2025-01-05 00:00:00 | 1899-12-30 04:00:00 | Hour | 2 | 45 | 0 | 2025-10-07 17:09:43 |  |  | False |
| 22 |  | None | Visit café for coffee | 2024-12-30 00:00:00 | 2024-12-31 00:00:00 | Medium | In Progress |  | True | 2025-01-10 00:00:00 | 1899-12-30 06:00:00 | Hour | 3 | 24 | 0 | 2025-10-07 17:09:43 |  |  | False |
| 23 | 24 | Project | Create flat tables | 2024-12-29 00:00:00 | 2024-12-31 00:00:00 | High | In Progress |  | False |  |  |  | 0 |  |  |  |  |  | False |
| 25 | 20 | Project | Prepare Powerpoint slides for training the employees | 2024-12-31 00:00:00 | 2025-01-01 00:00:00 | Medium | Not Started |  | False |  |  |  | 0 |  |  |  |  |  | False |
| 26 | 0 | None |  | 2025-01-02 00:00:00 | 2025-01-08 00:00:00 | Medium | Not Started |  | False |  |  |  | 0 |  |  |  |  |  | False |
| 27 | 0 | Project | Create new slides | 2025-01-01 00:00:00 | 2025-01-09 00:00:00 | High | Not Started |  | False |  |  |  | 0 |  |  |  |  |  | False |
| 28 | 0 | Daily Activity | J | 2025-01-08 00:00:00 | 2025-01-09 00:00:00 | Medium | Completed |  | False |  |  |  | 0 |  |  |  |  |  | False |

### `tblMeetingMinutes` — 5 rows *(recovered)*

| MeetingMinutesID | ProjectID | Subject | Description | Location | StartDate | StartTime | EndTime | Conclusion | NextMeeting | FollowupAction |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | Progress Achieved | I have achieved success in making sure all items are connected and working. I need to work on the next point now |  | 2024-12-12 00:00:00 | 1899-12-30 17:00:00 | 1899-12-30 18:00:00 | I need to be faster in implementation of the work | 2024-12-17 00:00:00 | What shall we on notes? |
| 2 | 24 | Effective replenishment processing | \<div\>Discuss ways to ensure we have restocking on time\</div\> | Upper Room | 2024-12-17 00:00:00 | 1899-12-30 16:00:00 | 1899-12-30 19:00:00 | Work on all components |  |  |
| 3 | 24 | Order point calculations | Determining the most appropriate order cycle from each source of<br>supply. |  | 2024-12-24 00:00:00 | 2024-12-24 00:00:00 | 2024-12-17 00:00:00 | Known when to take advantage of price breaks for a larger purchase. | 2024-12-03 00:00:00 |  |
| 4 | 24 | When to take advantage of price breaks for a larger purchase. | Determining the target (best size) order with a vendor.<br>Determining the most appropriate order cycle from each source of<br>supply |  |  |  |  | When to take advantage of price breaks for a larger purchase. |  |  |
| 5 |  | Migration | Platform migration |  | 2025-01-03 00:00:00 | 1899-12-30 10:10:00 | 1899-12-30 12:30:00 | The next meeting | 2025-01-18 00:00:00 | None |

> `MeetingID` values in `tblMeetingAgenda`/`tblMeetingParticipants` (0, 1, 2) reference these meetings; agenda rows with `MeetingID = 2` belong to *Effective replenishment processing*.

### `tblFinancialDocuments` — 9 rows *(recovered — MSSS document-type lookup, referenced by `tblProjectFinancialDocuments.DocumentID`)*

| DocumentID | DocumentType |
|---|---|
| 1 | DA |
| 2 | DAS |
| 3 | Demande de Signature |
| 4 | Dossier d'orpportunite |
| 5 | Appel d'offer/Call for Tender |
| 6 | Montage Financier |
| 7 | Requisation |
| 8 | A1 |
| 9 | Signed Direct Contract |

### `Switchboard Items` — 0 rows *(recovered)*

_(empty table)_

## 5. Saved queries (MSysQueries, reconstructed)

Access stores QueryDefs as attribute rows. Reconstruction below: `5` = FROM table, `6` = SELECT column (Name1 = alias), `7` = JOIN (Flag 1=INNER 2=LEFT 3=RIGHT), `8` = WHERE, `9` = GROUP BY, `11` = HAVING, `12` = ORDER BY, `3` = parameter. UI-generated `~sq_*` record-source queries for forms/reports are listed but not expanded.

### `qryKeywords`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblKeywords.Keyword,
       tblKeywords.Definition
FROM tblProjectFramework, tblKeywords
  tblProjectFramework LEFT JOIN tblKeywords ON tblProjectFramework.ProjectID = tblKeywords.ProjectID
```

### `qryAssumptionsConstraints`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblAssumptionsConstraints.AssumptionsConstraints,
       tblAssumptionsConstraints.AssumptionsValidated,
       tblAssumptionsConstraints.Type,
       tblAssumptionsConstraints.Impact,
       tblAssumptionsConstraints.[Mitigation Plan]
FROM tblProjectFramework, tblAssumptionsConstraints
  tblProjectFramework LEFT JOIN tblAssumptionsConstraints ON tblProjectFramework.ProjectID = tblAssumptionsConstraints.ProjectID
```

### `qryDailyActivityList`

```sql
SELECT tblProjectFramework.ProjectID,
       tblDailyActivityList.ProjectID,
       tblProjectFramework.ProjectName,
       tblDailyActivityList.DailyActivityListID,
       tblDailyActivityList.Requester,
       tblDailyActivityList.Task,
       tblDailyActivityList.MyActivity,
       tblDailyActivityList.Comments,
       tblDailyActivityList.Status,
       tblDailyActivityList.CompleteDate,
       tblDailyActivityList.RequestDate,
       tblDailyActivityList.Date,
       tblDailyActivityList.StatusID,
       tblDailyActivityList.Attachment
FROM tblProjectFramework, tblDailyActivityList
  tblProjectFramework INNER JOIN tblDailyActivityList ON tblProjectFramework.ProjectID = tblDailyActivityList.ProjectID
```

### `qryDailyActivityListExtended`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblDailyActivityList.DailyActivityListID,
       tblDailyActivityList.Requester,
       tblDailyActivityList.RequestDate,
       tblDailyActivityList.[Contact Method],
       tblDailyActivityList.Task,
       tblDailyActivityList.Date,
       tblDailyActivityList.Comments,
       tblDailyActivityList.Status,
       tblDailyActivityList.CompleteDate
FROM tblDailyActivityList, tblProjectFramework
  tblProjectFramework INNER JOIN tblDailyActivityList ON tblProjectFramework.ProjectID = tblDailyActivityList.ProjectID
```

### `qryDailyItemsAndStatusTypeByChoice`

```sql
SELECT tblDailyActivityList.ProjectID,
       tblDailyActivityList.Requester,
       tblDailyActivityList.RequestDate,
       tblDailyActivityList.Task,
       tblDailyActivityList.MyActivity,
       tblDailyActivityList.Date,
       tblDailyActivityList.Status,
       tblDailyActivityList.Comments,
       tblDailyActivityList.[Contact Method],
       tblDailyActivityList.CompleteDate,
       tblDailyActivityList.Attachment
FROM tblDailyActivityList
WHERE (((tblDailyActivityList.ProjectID)=[Forms]![frmProjectFramework]![cboProject]))
```

### `qryFinancialsExtended`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblFinancials.ProjectNumber,
       tblFinancials.Acquisation,
       tblFinancials.GlGrandLivre,
       tblFinancials.BudgetEnvelope,
       tblFinancials.Budget,
       tblFinancials.SpendBy,
       tblFinancials.RecurrentFees,
       tblFinancials.ContractTimeframe,
       tblFinancialDocuments.DocumentType,
       IIf([IsRequired],"Yes","No") AS [Required],
       tblProjectFinancialDocuments.ReasonNotCreated
FROM tblProjectFramework, tblFinancials, tblFinancialDocuments, tblProjectFinancialDocuments
  tblFinancialDocuments INNER JOIN tblProjectFinancialDocuments ON tblFinancialDocuments.DocumentID = tblProjectFinancialDocuments.DocumentID
  tblFinancialDocuments INNER JOIN tblProjectFinancialDocuments ON tblFinancialDocuments.DocumentID = tblProjectFinancialDocuments.DocumentID
  tblFinancials INNER JOIN tblProjectFinancialDocuments ON tblFinancials.FinancialID = tblProjectFinancialDocuments.FinancialID
  tblProjectFramework INNER JOIN tblFinancials ON tblProjectFramework.ProjectID = tblFinancials.ProjectID
HAVING tblProjectFramework.ProjectID AND tblFinancialDocuments.DocumentType
```

### `qryInProgressToDo`

```sql
SELECT tblDailyActivityList.DailyActivityListID,
       tblDailyActivityList.Task,
       Count(tblTodoList.TodoItemId) AS [InProgressCount]
FROM tblDailyActivityList, tblTodoList
  tblDailyActivityList LEFT JOIN tblTodoList ON tblDailyActivityList.DailyActivityListID = tblTodoList.ProjectActivityID
WHERE (((tblTodoList.Status) Not In ('In Review','Cancelled','Completed')) AND ((tblTodoList.ProjectOrActivity)='Daily Activity'))
GROUP BY tblDailyActivityList.DailyActivityListID, tblDailyActivityList.Task
```

### `qryITResourcePlanning`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblITResourcePlanning.Resource,
       tblITResourcePlanningDetails.DetailText,
       tblITResourcePlanningDetails.Needed
FROM tblProjectFramework, tblITResourcePlanning, tblITResourcePlanningDetails
  tblProjectFramework LEFT JOIN tblITResourcePlanning ON tblProjectFramework.ProjectID = tblITResourcePlanning.ProjectID
  tblITResourcePlanning LEFT JOIN tblITResourcePlanningDetails ON tblITResourcePlanning.ITResourceID = tblITResourcePlanningDetails.ITResourceID
```

### `qryMeetingApologies`

```sql
SELECT tblMeetingParticipants.[Meeting ID],
       tblMeetingParticipants.[Participant ID],
       [Participant Name] & IIf(IsNull([Position]),""," - " & [Position]) & IIf(IsNull([Organization]),"",", " & [Organization]) AS [participant]
FROM tblMeetingParticipants
WHERE (((tblMeetingParticipants.Apology)="Apology"))
```

### `qryMeetingAttendees`

```sql
SELECT tblMeetingParticipants.[Meeting ID],
       tblMeetingParticipants.[Participant ID],
       [Participant Name] & IIf(IsNull([Position]),""," - " & [Position]) & IIf(IsNull([Organization]),"",", " & [Organization]) AS [participant],
       tblMeetingParticipants.Apology
FROM tblMeetingParticipants
WHERE (((tblMeetingParticipants.Apology)="Attendee"))
```

### `qryMeetingMinutes`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblMeetingMinutes.MeetingMinutesID,
       tblMeetingMinutes.Subject,
       tblMeetingMinutes.Description,
       tblMeetingMinutes.Location,
       tblMeetingMinutes.StartDate,
       tblMeetingMinutes.StartTime,
       tblMeetingMinutes.EndTime,
       tblMeetingMinutes.Conclusion,
       tblMeetingMinutes.NextMeeting,
       tblMeetingMinutes.FollowupAction,
       tblMeetingAgenda.AgendaID,
       tblMeetingAgenda.[Agenda Item],
       tblMeetingDiscussionPoints.DiscussionItemID,
       tblMeetingDiscussionPoints.DiscussionPoint,
       tblMeetingActionItems.[Action Item Id],
       tblMeetingActionItems.Action,
       tblMeetingActionItems.AssignedTo,
       tblMeetingActionItems.DueDate
FROM tblProjectFramework, tblMeetingMinutes, tblMeetingAgenda, tblMeetingDiscussionPoints, tblMeetingActionItems
  tblProjectFramework LEFT JOIN tblMeetingMinutes ON tblProjectFramework.ProjectID = tblMeetingMinutes.ProjectID
  tblMeetingAgenda LEFT JOIN tblMeetingDiscussionPoints ON tblMeetingAgenda.AgendaID = tblMeetingDiscussionPoints.AgendaID
  tblMeetingDiscussionPoints LEFT JOIN tblMeetingActionItems ON tblMeetingDiscussionPoints.DiscussionItemID = tblMeetingActionItems.DiscussionID
  tblMeetingMinutes LEFT JOIN tblMeetingAgenda ON tblMeetingMinutes.MeetingMinutesID = tblMeetingAgenda.MeetingID
```

### `qryMeetingMinutes Extended`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblMeetingMinutes.Subject,
       tblMeetingMinutes.Description,
       tblMeetingMinutes.StartDate,
       tblMeetingMinutes.StartTime,
       tblMeetingMinutes.EndTime,
       tblMeetingMinutes.PersonResponsible,
       tblMeetingMinutes.Conclusion,
       tblMeetingMinutes.NextMeeting,
       tblMeetingMinutes.TentativeTopic,
       tblMeetingMinutes.IsActive,
       tblMeetingMinutes.Status,
       tblMeetingActionItems.[Agenda Item],
       tblMeetingActionItems.[Discussion Points],
       tblMeetingActionItems.Actions,
       tblMeetingActionItems.[Due Date],
       tblMeetingParticipants.[Participant Name],
       tblMeetingParticipants.Organization,
       tblMeetingParticipants.Position,
       tblMeetingParticipants.Apology,
       tblMeetingMinutes.MeetingMinutesID
FROM tblMeetingMinutes, tblProjectFramework, tblMeetingActionItems, tblMeetingParticipants
  tblMeetingMinutes LEFT JOIN tblProjectFramework ON tblMeetingMinutes.ProjectID = tblProjectFramework.ProjectID
  tblMeetingMinutes INNER JOIN tblMeetingActionItems ON tblMeetingMinutes.MeetingMinutesID = tblMeetingActionItems.[Meeting Id]
  tblMeetingMinutes INNER JOIN tblMeetingParticipants ON tblMeetingMinutes.MeetingMinutesID = tblMeetingParticipants.[Meeting ID]
WHERE (((tblMeetingParticipants.Apology)="attendee"))
```

### `qryMinutes`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblMeetingMinutes.MeetingMinutesID,
       tblMeetingMinutes.Subject,
       tblMeetingMinutes.Description,
       tblMeetingMinutes.Location,
       tblMeetingMinutes.StartDate,
       tblMeetingMinutes.StartTime,
       tblMeetingMinutes.EndTime,
       tblMeetingMinutes.Conclusion,
       tblMeetingMinutes.NextMeeting,
       tblMeetingMinutes.FollowupAction
FROM tblProjectFramework, tblMeetingMinutes
  tblProjectFramework LEFT JOIN tblMeetingMinutes ON tblProjectFramework.ProjectID = tblMeetingMinutes.ProjectID
WHERE (((tblMeetingMinutes.MeetingMinutesID) Is Not Null))
```

### `qryObjectives`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblProjectObjectives.ProjectObjID,
       tblProjectObjectives.ProjectObjectives,
       tblProjectObjectives.QMeasurable,
       tblProjectObjectives.QSuccess,
       tblProjectObjectives.QAlignmentStrategy
FROM tblProjectFramework, tblProjectObjectives
  tblProjectFramework LEFT JOIN tblProjectObjectives ON tblProjectFramework.ProjectID = tblProjectObjectives.ProjectID
```

### `qryParkingLotItems`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblParkingLotItems.ParkingLotItem,
       tblStakeholders.FirstName,
       tblStakeholders.LastName,
       tblParkingLotItems.IsStrikethrough
FROM tblProjectFramework, tblStakeholders, tblParkingLotItems
  tblStakeholders LEFT JOIN tblParkingLotItems ON tblStakeholders.StakeholderID = tblParkingLotItems.Participant
  tblProjectFramework LEFT JOIN tblStakeholders ON tblProjectFramework.ProjectID = tblStakeholders.ProjectID
```

### `qryProject`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tblProjectFramework.ProjectManager,
       tblProjectFramework.BusinessAnalyst,
       tblProjectFramework.ProjectSponsor,
       tblProjectFramework.DateOfProject,
       tblProjectFramework.ProblemStatement,
       tblProjectFramework.CurrentState,
       tblProjectFramework.FutureState,
       tblProjectFramework.StartDate,
       tblProjectFramework.EndDate,
       tblProjectFramework.FinancingSource,
       tblProjectFramework.FinancingCost,
       tblProjectFramework.[Recurrent Cost],
       tblProjectFramework.PurchaseEquipment,
       tblProjectFramework.EquipmentNotes
FROM tblProjectFramework
```

### `qryProjectKeywords`

```sql
SELECT tblKeywords.ProjectID,
       tblKeywords.Keyword,
       tblKeywords.Definition,
       Description
FROM tblKeywords
```

### `qryProjectActivityList`

```sql
SELECT tblDailyActivityList.ProjectID,
       tblDailyActivityList.DailyActivityListID,
       tblProjectFramework.ProjectName,
       tblDailyActivityList.Requester,
       tblDailyActivityList.Task,
       tblDailyActivityList.MyActivity,
       tblDailyActivityList.Date,
       tblActivityStatusType.ActivityStatus,
       tblDailyActivityList.StatusID,
       tblDailyActivityList.Comments,
       tblDailyActivityList.Attachment
FROM tblProjectFramework, tblActivityStatusType, tblDailyActivityList
  tblActivityStatusType INNER JOIN tblDailyActivityList ON tblActivityStatusType.DailyActivityListID = tblDailyActivityList.DailyActivityListID
  tblProjectFramework INNER JOIN tblDailyActivityList ON tblProjectFramework.ProjectID = tblDailyActivityList.ProjectID
```

### `qryProjectExistingSystem`

```sql
SELECT tblProjectFramework.ProjectName,
       tblExistingSystemsInterfaces.ExistSysInt,
       tblExistingSystemsInterfaces.Notes,
       tblExistingSystemsInterfaces.ProjectID,
       tblExistingSystemsInterfaces.Location
FROM tblProjectFramework, tblExistingSystemsInterfaces
  tblProjectFramework INNER JOIN tblExistingSystemsInterfaces ON tblProjectFramework.ProjectID = tblExistingSystemsInterfaces.ProjectID
```

### `qryProjectFramework`

```sql
SELECT *
FROM tblProjectFramework
WHERE ([Forms]![frmProjectFramework]![cboProject] IS NULL 
       OR tblProjectFramework.ProjectID = [Forms]![frmProjectFramework]![cboProject])
```

### `qryProjectKeyRequirementsDeliverable`

```sql
SELECT tblKeyRequirementsDeliverable.ProjectID,
       tblKeyRequirementsDeliverable.KeyReq
FROM tblKeyRequirementsDeliverable, tblProjectFramework
  tblProjectFramework INNER JOIN tblKeyRequirementsDeliverable ON tblProjectFramework.ProjectID = tblKeyRequirementsDeliverable.ProjectID
```

### `qryProjectObjectives`

```sql
SELECT tblProjectObjectives.QMeasurable,
       tblProjectObjectives.QSuccess,
       tblProjectObjectives.QAlignmentStrategy,
       tblProjectObjectives.ProjectObjectives,
       tblProjectObjectives.ProjectID
FROM tblProjectObjectives, tblProjectFramework
  tblProjectFramework INNER JOIN tblProjectObjectives ON tblProjectFramework.ProjectID = tblProjectObjectives.ProjectID
```

### `qryProjectReports`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectOrTask,
       tblProjectFramework.ProjectSponsor,
       tblProjectFramework.ProjectName,
       tblProjectFramework.ProjectManager,
       tblProjectFramework.BusinessAnalyst,
       tblProjectFramework.ProjectDocs,
       tblProjectFramework.DateOfProject,
       tblProjectFramework.Keywords,
       tblProjectFramework.ProblemStatement,
       tblProjectFramework.CurrentState,
       tblProjectFramework.FutureState,
       tblProjectFramework.ProjectStatusCom,
       tblProjectFramework.UserImpact,
       tblProjectFramework.Mandate,
       tblProjectFramework.QProjectPlan,
       tblProjectFramework.QProjectsUnderway,
       tblProjectFramework.QRiskIdentified,
       tblProjectFramework.QRequestedComDate,
       tblProjectFramework.QRecommendedSol,
       tblProjectFramework.SoftwareStorage,
       tblProjectFramework.SoftwareDevMet,
       tblProjectFramework.DevPhyLoc,
       tblProjectFramework.Vendor,
       tblProjectFramework.CoreProbOpp,
       tblProjectFramework.ExistBusMod,
       tblProjectFramework.ConstraintsRisk,
       tblProjectFramework.ConstraintsRisk,
       tblProjectFramework.A1,
       tblProjectFramework.DA,
       tblProjectFramework.DAS,
       tblProjectFramework.PurchaseOrder,
       tblProjectFramework.Requisition,
       tblProjectFramework.DO,
       tblProjectFramework.FinancingSource,
       tblProjectFramework.FinancingCost,
       tblProjectFramework.[Recurrent Cost],
       tblProjectFramework.PurchaseEquipment,
       tblProjectFramework.EquipmentNotes,
       tblProjectFramework.Foundation,
       tblProjectFramework.ITSecurity,
       tblProjectFramework.Infrastructure,
       tblProjectFramework.StartDate,
       tblProjectFramework.EndDate,
       tblProjectFramework.SimilarProject
FROM tblProjectFramework
WHERE (((tblProjectFramework.ProjectID)=[Forms]![frmProjectReports]![cboProject]))
```

### `qryProjectStakeholders`

```sql
SELECT tblStakeholders.FirstName,
       tblStakeholders.LastName,
       tblStakeholders.DepartmentOrganization,
       tblStakeholders.ProjectRole,
       tblStakeholders.PhysicalLocation,
       tblStakeholders.AdditionalNotes,
       tblStakeholders.ProjectID,
       tblStakeholders.PhoneNumber,
       tblStakeholders.Mobile,
       tblStakeholders.[Ext#],
       tblStakeholders.[Org Title]
FROM tblProjectFramework, tblStakeholders
  tblProjectFramework LEFT JOIN tblStakeholders ON tblProjectFramework.ProjectID = tblStakeholders.ProjectID
```

### `qryStakeholders`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       [FirstName] & " " & [LastName] AS [PersonName],
       tblStakeholders.DepartmentOrganization,
       tblStakeholders.ProjectRole,
       tblStakeholders.PhoneNumber,
       tblStakeholders.[Ext#],
       tblStakeholders.Mobile,
       tblStakeholders.PhysicalLocation,
       tblStakeholders.[Org Title]
FROM tblProjectFramework, tblStakeholders
  tblProjectFramework LEFT JOIN tblStakeholders ON tblProjectFramework.ProjectID = tblStakeholders.ProjectID
```

### `qrySuppliers`

```sql
SELECT tblProjectFramework.ProjectID,
       tblProjectFramework.ProjectName,
       tbl3rdPartySupplier.SupplierName
FROM tblProjectFramework, tbl3rdPartySupplier
  tblProjectFramework LEFT JOIN tbl3rdPartySupplier ON tblProjectFramework.ProjectID = tbl3rdPartySupplier.ProjectID
```

### `qryUpcomingAlerts`

```sql
SELECT tblTodoList.TodoItemId,
       tblTodoList.TodoItem,
       tblTodoList.DueDate,
       tblTodoList.Priority,
       tblTodoList.Status,
       IIf(([DueDate]<Date()),"Overdue",IIf(([DueDate]-2)<=Date(),"Approaching Deadline","Normal")) AS [AlertType]
FROM tblTodoList
WHERE (((tblTodoList.Status) Not In ("Completed","Cancelled")) And (([DueDate]-2)<=Date())) Or (((tblTodoList.Status) Not In ("Completed","Cancelled")) And ((tblTodoList.DueDate)<Date()))
```

### Recovered queries (deleted-flagged slots, SQL via `mdb-queries`)

```sql
-- qryDailyItemsAndStatusType
SELECT * FROM [tblDailyActivityList] ORDER BY tblDailyActivityList.RequestDate;

-- qryKeyReqDeliverables
SELECT tblProjectFramework.ProjectID, tblProjectFramework.ProjectName,
       tblKeyRequirementsDeliverable.KeyReqDevID, tblKeyRequirementsDeliverable.KeyReq
FROM [tblProjectFramework], [tblKeyRequirementsDeliverable];

-- qryMeetingParticipants
SELECT tblMeetingParticipants.Participant, [FirstName] & " " & [LastName],
       tblMeetingParticipants.Apology, tblMeetingParticipants.[Meeting ID]
FROM [tblMeetingParticipants], [tblStakeholders];

-- qryProject3rdPartySupplier
SELECT tbl3rdPartySupplier.ProjectID, tbl3rdPartySupplier.SupplierName,
       tbl3rdPartySupplier.[Contact Person], tbl3rdPartySupplier.[Email Address],
       tbl3rdPartySupplier.[Contract Start Date], tbl3rdPartySupplier.[Contract End Date],
       tbl3rdPartySupplier.Rating, tbl3rdPartySupplier.Address,
       tbl3rdPartySupplier.[Province or State], tbl3rdPartySupplier.Country,
       tbl3rdPartySupplier.[Postal Code], tbl3rdPartySupplier.City
FROM [tbl3rdPartySupplier], [tblProjectFramework];

-- qryProjectfrmQA
SELECT tblInterviewQuestionsAnswers.ProjectID, tblInterviewQuestionsAnswers.Question,
       tblInterviewQuestionsAnswers.Answer
FROM [tblInterviewQuestionsAnswers], [tblProjectFramework];

-- qryQuesAns
SELECT tblProjectFramework.ProjectID, tblProjectFramework.ProjectName,
       tblInterviewQuestionsAnswers.Question, tblInterviewQuestionsAnswers.Answer
FROM [tblProjectFramework], [tblInterviewQuestionsAnswers];
```

### UI record-source queries (`~sq_*`, not expanded)

`~sq_cActivity List~sq_ccboFilterFavorites`, `~sq_cfrmDailyItemsAndStatusTypeChoice~sq_cProjectNameCopy`, `~sq_cfrmProjectReports~sq_ccboProject`, `~sq_cfrmReportSelector~sq_cListProjects`, `~sq_cfrmSubKeywords~sq_csubfrmEntryKeywords`, `~sq_cfrmSubDailyItemsAndStatusType~sq_cProjectID`, `~sq_cfrmSubFinancials~sq_csubfrmEntryKeywords`, `~sq_cfrmSubMeetingMinutes~sq_caddMeetingMinutesub`, `~sq_cfrmSubMeetingMinutes~sq_csubfrmMeetingActionItems`, `~sq_cfrmSubNotes~sq_csubfrmEntryKeywords`, `~sq_cfrmSubNotes~sq_csubfrmListKeywords`, `~sq_cfrmSubObjectives~sq_csubfrmEntryObjectives`, `~sq_cfrmSubParkingLotItems~sq_csubfrmEntryParkingLotItems`, `~sq_cfrmSubParkingLotItems~sq_csubfrmListParkingLotItems`, `~sq_cfrmSubQuestionsAnswers~sq_csubfrmListQuestionsAnswers`, `~sq_cfrmSubStakeholders~sq_csubfrmListStakeholders`, `~sq_cfrmSubSuppliers~sq_csubfrmListSuppliers`, `~sq_csubfrmEntryFinancials~sq_csubformFinancialDocuments`, `~sq_csubfrmEntryITResourcePlanning~sq_csubformResourcesPlanning`, `~sq_csubfrmMeetingAgenda~sq_csubfrmMeetingActionItems`, `~sq_csubfrmMeetingAgenda~sq_csubfrmMeetingDiscussionPoints`, `~sq_drptDetailedProjectReportS~sq_dsubrptMeetingMinutes`, `~sq_drptMeetingMinutes~sq_dsubrptMeetingApologies`, `~sq_dsubrptMeetingMinutes~sq_dsubrptMeetingApologies`, `~sq_fSwitchboard`, `~sq_ffrmSubProjects`, `~sq_fsubfrmEntryITResourcePlanning`, `~sq_fsubfrmEntryQuestionsAnswers`, `~sq_fsubfrmEntrySuppliers`, `~sq_fsubfrmListKeywords`, `~sq_fsubfrmListFinancials`, `~sq_fsubfrmListKeyReqDeliverables`, `~sq_fsubfrmListParkingLotItems`, `~sq_fsubfrmListResourcesPlanning`, `~sq_fsubfrmListRisksIssuesTracker`, `~sq_fsubfrmListSuppliers`, `~sq_rsubrptFinancials`, `~sq_rsubrptKeyReqDeliverables`, `~sq_rsubrptObjectives`, `~sq_rsubrptParkingLotItems`, `~sq_rsubrptStakeholders`
