import { describe, expect, it } from "vitest";
import {
  assumptionConstraintFormValues,
  updateAssumptionConstraintFormSchema,
} from "@/modules/assumptions-constraints/schemas/assumption-constraint-form";
import {
  dailyActivityFormValues,
  updateDailyActivityFormSchema,
} from "@/modules/daily-activities/schemas/daily-activity-form";
import {
  deliverableFormValues,
  updateKeyDeliverableFormSchema,
} from "@/modules/key-deliverables/schemas/key-deliverable-form";
import {
  keywordFormValues,
  updateKeywordFormSchema,
} from "@/modules/keywords/schemas/keyword-form";
import {
  objectiveFormValues,
  updateObjectiveFormSchema,
} from "@/modules/objectives/schemas/objective-form";
import {
  parkingLotItemFormValues,
  updateParkingLotItemFormSchema,
} from "@/modules/parking-lot/schemas/parking-lot-item-form";
import {
  projectFormValues,
  updateProjectFormSchema,
} from "@/modules/projects/schemas/project-form";
import {
  questionAnswerFormValues,
  updateQuestionAnswerFormSchema,
} from "@/modules/questions-answers/schemas/question-answer-form";
import {
  stakeholderFormValues,
  updateStakeholderFormSchema,
} from "@/modules/stakeholders/schemas/stakeholder-form";
import {
  supplierFormValues,
  updateSupplierFormSchema,
} from "@/modules/suppliers/schemas/supplier-form";
import {
  todoItemFormValues,
  updateTodoItemFormSchema,
} from "@/modules/todo-items/schemas/todo-item-form";

/**
 * Datasheet contract (ADR-0023): a cell edit sends the row's form values with
 * one field replaced to the module's update action. So for every module the
 * row → form values → update form schema round trip must keep the record as
 * it is — a cell edit must never clear or change another field.
 */
const created = new Date("2026-10-01T00:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const audit = { CreatedAtUtc: created, UpdatedAtUtc: null, RowVer: 42 };

describe("datasheet form values round-trip through each update form schema", () => {
  it("key deliverables keep requirement, dates, assignees and list values", () => {
    const parsed = updateKeyDeliverableFormSchema.parse(
      deliverableFormValues({
        KeyDeliverableId: 5,
        ProjectId: 2,
        KeyRequirement: "Sign-off",
        RequestedDate: day("2026-10-02"),
        Deadline: day("2026-11-30"),
        Priority: "Critical",
        Status: "Legacy status",
        AssigneeNames: "A, B",
        AssigneesJson: undefined,
        Assignees: [
          { id: 3, name: "A" },
          { id: 4, name: "B" },
        ],
        ...audit,
      }),
    );
    expect(parsed).toMatchObject({
      keyDeliverableId: 5,
      rowVer: 42,
      projectId: 2,
      keyRequirement: "Sign-off",
      deadline: day("2026-11-30"),
      assigneeIds: [3, 4],
      priority: "Critical",
      status: "Legacy status",
    });
  });

  it("daily activities keep the status id, numbers and project-less scope", () => {
    const parsed = updateDailyActivityFormSchema.parse(
      dailyActivityFormValues({
        DailyActivityId: 9,
        ProjectId: null,
        ActivityStatusId: 12,
        ActivityStatus: "Not Started",
        Requester: "Erick",
        Task: "Call vendor",
        MyActivity: null,
        ActivityDate: null,
        Comments: null,
        RequestDate: day("2026-10-08"),
        Status: null,
        CompleteDate: null,
        ContactMethod: "Questions I have",
        TimeSpent: 2,
        AssignedTo: null,
        TaskType: "Technical",
        Progress: 50,
        ...audit,
      }),
    );
    expect(parsed).toMatchObject({
      dailyActivityId: 9,
      projectId: null,
      activityStatusId: 12,
      requester: "Erick",
      task: "Call vendor",
      requestDate: day("2026-10-08"),
      contactMethod: "Questions I have",
      timeSpent: 2,
      taskType: "Technical",
      progress: 50,
    });
  });

  it("stakeholders keep every field", () => {
    const parsed = updateStakeholderFormSchema.parse(
      stakeholderFormValues({
        StakeholderId: 3,
        ProjectId: 2,
        FirstName: "Gary",
        LastName: "Lee",
        DepartmentOrganization: "IT",
        ProjectRole: "Sponsor",
        RoleDescription: null,
        PhoneNumber: "555",
        PhoneExt: null,
        Mobile: null,
        EmailAddress: "gary@example.com",
        PhysicalLocation: null,
        OrgTitle: null,
        CommunicationPreference: "Meetings",
        EngagementLevel: "High",
        AdditionalNotes: "Notes",
        ...audit,
      }),
    );
    expect(parsed).toMatchObject({
      stakeholderId: 3,
      firstName: "Gary",
      lastName: "Lee",
      emailAddress: "gary@example.com",
      communicationPreference: "Meetings",
      engagementLevel: "High",
      additionalNotes: "Notes",
    });
  });

  it("suppliers keep dates and rating", () => {
    const parsed = updateSupplierFormSchema.parse(
      supplierFormValues({
        SupplierId: 6,
        ProjectId: 2,
        SupplierName: "Acme",
        ContactPerson: null,
        EmailAddress: null,
        ContractStartDate: day("2026-01-01"),
        ContractEndDate: day("2026-12-31"),
        Rating: "Good",
        Address: null,
        ProvinceOrState: null,
        Country: "Canada",
        PostalCode: null,
        City: "Montreal",
        ...audit,
      }),
    );
    expect(parsed).toMatchObject({
      supplierId: 6,
      supplierName: "Acme",
      contractEndDate: day("2026-12-31"),
      rating: "Good",
      city: "Montreal",
    });
  });

  it("Q&A records keep question, answer and list values", () => {
    const parsed = updateQuestionAnswerFormSchema.parse(
      questionAnswerFormValues({
        QuestionAnswerId: 1,
        ProjectId: 2,
        Question: "Budget?",
        Answer: "Yes",
        Category: "Budget",
        Priority: "High",
        AssignedTo: null,
        ...audit,
      }),
    );
    expect(parsed).toMatchObject({
      questionAnswerId: 1,
      question: "Budget?",
      answer: "Yes",
      category: "Budget",
      priority: "High",
    });
  });

  it("assumptions and constraints keep the validated flag both ways", () => {
    const row = {
      AssumptionConstraintId: 1,
      ProjectId: 2,
      Type: "Constraint",
      Description: "Fixed date",
      IsValidated: true,
      Impact: "High",
      MitigationPlan: null,
      ...audit,
    };
    expect(
      updateAssumptionConstraintFormSchema.parse(assumptionConstraintFormValues(row)),
    ).toMatchObject({
      type: "Constraint",
      description: "Fixed date",
      isValidated: true,
      impact: "High",
    });
    expect(
      updateAssumptionConstraintFormSchema.parse(
        assumptionConstraintFormValues({ ...row, IsValidated: false }),
      ).isValidated,
    ).toBe(false);
  });

  it("objectives, keywords and parking-lot items keep their fields", () => {
    expect(
      updateObjectiveFormSchema.parse(
        objectiveFormValues({
          ObjectiveId: 1,
          ProjectId: 2,
          ObjectiveText: "Go live",
          QMeasurable: "Date",
          QSuccess: null,
          QAlignmentStrategy: null,
          ...audit,
        }),
      ),
    ).toMatchObject({ objectiveText: "Go live", qMeasurable: "Date" });
    expect(
      updateKeywordFormSchema.parse(
        keywordFormValues({
          KeywordId: 1,
          ProjectId: null,
          Keyword: "ERP",
          Definition: "Planning",
          ...audit,
        }),
      ),
    ).toMatchObject({ projectId: null, keyword: "ERP", definition: "Planning" });
    expect(
      updateParkingLotItemFormSchema.parse(
        parkingLotItemFormValues({
          ParkingLotItemId: 1,
          ProjectId: 2,
          ParkingLotItem: "Later",
          StakeholderId: 7,
          IsStrikethrough: true,
          FollowUpActions: "Ask",
          Owner: "Ann",
          ...audit,
        }),
      ),
    ).toMatchObject({
      parkingLotItem: "Later",
      stakeholderId: 7,
      isStrikethrough: true,
      followUpActions: "Ask",
      owner: "Ann",
    });
  });

  it("to-dos keep the activity link, dates and list values", () => {
    const parsed = updateTodoItemFormSchema.parse(
      todoItemFormValues({
        TodoItemId: 4,
        ProjectId: 2,
        DailyActivityId: 9,
        ProjectOrActivity: "Daily Activity",
        TodoItem: "Call",
        StartDate: null,
        DueDate: day("2026-10-20"),
        Priority: "High",
        Status: "In Review",
        Notes: null,
        SortKey: 3,
        ...audit,
      }),
    );
    expect(parsed).toMatchObject({
      todoItemId: 4,
      projectId: 2,
      dailyActivityId: 9,
      projectOrActivity: "Daily Activity",
      todoItem: "Call",
      dueDate: day("2026-10-20"),
      priority: "High",
      status: "In Review",
    });
  });

  it("projects keep the charter's flags, money and dates", () => {
    const parsed = updateProjectFormSchema.parse(
      projectFormValues({
        ProjectId: 2,
        ProjectName: "ERP",
        ProjectManager: "Erick",
        BusinessAnalyst: null,
        ProjectDocs: null,
        ProjectSponsor: null,
        DateOfProject: null,
        ProblemStatement: "Slow",
        CurrentState: null,
        FutureState: null,
        UserImpact: null,
        Mandate: null,
        ProjectStatusCom: null,
        ExistBusMod: null,
        A1: true,
        DA: false,
        DAS: true,
        PurchaseOrder: false,
        Requisition: true,
        DO: false,
        FinancingSource: null,
        FinancingCost: 1500.5,
        RecurrentCost: null,
        PurchaseEquipment: true,
        EquipmentNotes: null,
        StartDate: day("2026-01-05"),
        EndDate: null,
        SimilarProject: false,
        ProjectPriority: "High",
        EstimatedCompletionDate: null,
        ProjectStatus: "In progress",
        ProjectPhase: "Planning",
        RiskLevel: "Low",
        ...audit,
      }),
    );
    expect(parsed).toMatchObject({
      projectId: 2,
      projectName: "ERP",
      problemStatement: "Slow",
      a1: true,
      da: false,
      das: true,
      requisition: true,
      financingCost: 1500.5,
      purchaseEquipment: true,
      startDate: day("2026-01-05"),
      projectPriority: "High",
      projectStatus: "In progress",
      projectPhase: "Planning",
      riskLevel: "Low",
    });
  });
});
