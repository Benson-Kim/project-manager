const fs = require("fs");
const path = require("path");

// List of all project-related resources from your Prisma schema
const resources = [
	"stakeholders",
	"acronyms",
	"keyDeliverables",
	"objectives",
	"questionAnswers",
	"suppliers",
	"assumptionConstraints",
	"parkingLotItems",
	"itResources",
	"financials",
	"issueRisks",
	"dailyActivities",
	"notes",
	"tasks",
	"milestones",
	"resources",
	"meetings",
	"projectMembers",
];

// Map resource names to their corresponding ResourceTypes (camelCase to UPPER_CASE)
const resourceTypeMap = {
	stakeholders: "STAKEHOLDER",
	acronyms: "ACRONYM",
	keyDeliverables: "KEY_DELIVERABLE",
	objectives: "OBJECTIVE",
	questionAnswers: "QUESTION_ANSWER",
	suppliers: "SUPPLIER",
	assumptionConstraints: "ASSUMPTION_CONSTRAINT",
	parkingLotItems: "PARKING_LOT_ITEM",
	itResources: "IT_RESOURCE",
	financials: "FINANCIAL",
	issueRisks: "ISSUE_RISK",
	dailyActivities: "DAILY_ACTIVITY",
	notes: "NOTE",
	tasks: "TASK",
	milestones: "MILESTONE",
	resources: "RESOURCE",
	meetings: "MEETING",
	projectMembers: "PROJECT_MEMBER",
};

// Base directory for app/projects/[id]
const baseDir = path.join(__dirname, "app", "projects", "[id]");

// Ensure the base directory exists
if (!fs.existsSync(baseDir)) {
	fs.mkdirSync(baseDir, { recursive: true });
}

// Template for page.js (ItemList)
const listPageTemplate = (resourceName, resourceType) => `
"use client";
import ItemList from "@/components/ItemList";
import { useParams, useRouter } from "next/navigation";
import { ResourceTypes } from "@/lib/permissions";
import { useEffect } from "react";

export default function ${
	resourceName.charAt(0).toUpperCase() + resourceName.slice(1)
}ListPage() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (!id || id === "undefined") {
      console.error("Invalid id:", id);
      router.push("/dashboard/projects");
    }
  }, [id, router]);

  if (!id || id === "undefined") return null;

  return (
    <ItemList
      projectId={id}
      resourceType={ResourceTypes.${resourceType}}
      resourceName="${resourceName}"
    />
  );
}
`;

// Template for [itemId]/page.js (ItemDetail)
const detailPageTemplate = (resourceName, resourceType) => `
"use client";
import ItemDetail from "@/components/ItemDetail";
import { useParams, useRouter } from "next/navigation";
import { ResourceTypes } from "@/lib/permissions";
import { useEffect } from "react";

export default function ${
	resourceName.charAt(0).toUpperCase() + resourceName.slice(1)
}DetailPage() {
  const { id, itemId } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (!id || id === "undefined") {
      console.error("Invalid id:", id);
      router.push("/dashboard/projects");
    }
  }, [id, router]);

  if (!id || id === "undefined") return null;

  return (
    <ItemDetail
      projectId={id}
      resourceType={ResourceTypes.${resourceType}}
      resourceName="${resourceName}"
      itemId={itemId}
    />
  );
}
`;

// Function to create directories and files
const generatePages = () => {
	resources.forEach((resource) => {
		const resourceDir = path.join(baseDir, resource);
		const itemIdDir = path.join(resourceDir, "[itemId]");

		// Create resource directory if it doesn’t exist
		if (!fs.existsSync(resourceDir)) {
			fs.mkdirSync(resourceDir, { recursive: true });
		}

		// Create [itemId] directory if it doesn’t exist
		if (!fs.existsSync(itemIdDir)) {
			fs.mkdirSync(itemIdDir, { recursive: true });
		}

		// Write page.js
		const listFilePath = path.join(resourceDir, "page.js");
		fs.writeFileSync(
			listFilePath,
			listPageTemplate(resource, resourceTypeMap[resource]),
			"utf8"
		);
		console.log(`Created ${listFilePath}`);

		// Write [itemId]/page.js
		const detailFilePath = path.join(itemIdDir, "page.js");
		fs.writeFileSync(
			detailFilePath,
			detailPageTemplate(resource, resourceTypeMap[resource]),
			"utf8"
		);
		console.log(`Created ${detailFilePath}`);
	});
};

// Run the script
try {
	generatePages();
	console.log("All resource pages generated successfully!");
} catch (error) {
	console.error("Error generating pages:", error);
}
