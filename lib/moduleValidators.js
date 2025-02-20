// lib/moduleValidators.js
import { APIError } from "@/lib/utils";

// Stakeholder validator
export const validateStakeholder = (data) => {
	const { name, role } = data;

	if (!name?.trim()) {
		throw new APIError("Stakeholder name is required", 400);
	}

	if (!role?.trim()) {
		throw new APIError("Stakeholder role is required", 400);
	}

	if (name.length > 100) {
		throw new APIError("Name must be less than 100 characters", 400);
	}

	return true;
};

// Acronym validator
export const validateAcronym = (data) => {
	const { acronym, definition } = data;

	if (!acronym?.trim()) {
		throw new APIError("Acronym is required", 400);
	}

	if (!definition?.trim()) {
		throw new APIError("Definition is required", 400);
	}

	if (acronym.length > 20) {
		throw new APIError("Acronym must be less than 20 characters", 400);
	}

	return true;
};

// Key Deliverable validator
export const validateKeyDeliverable = (data) => {
	const { name, status } = data;

	if (!name?.trim()) {
		throw new APIError("Deliverable name is required", 400);
	}

	if (status && !["PLANNED", "IN_PROGRESS", "COMPLETED"].includes(status)) {
		throw new APIError("Invalid status value", 400);
	}

	return true;
};

// Objective validator
export const validateObjective = (data) => {
	const { title } = data;

	if (!title?.trim()) {
		throw new APIError("Objective title is required", 400);
	}

	return true;
};

// Question & Answer validator
export const validateQuestionAnswer = (data) => {
	const { question, status } = data;

	if (!question?.trim()) {
		throw new APIError("Question is required", 400);
	}

	if (status && !["OPEN", "ANSWERED", "CLOSED"].includes(status)) {
		throw new APIError("Invalid status value", 400);
	}

	return true;
};

// Supplier validator
export const validateSupplier = (data) => {
	const { name } = data;

	if (!name?.trim()) {
		throw new APIError("Supplier name is required", 400);
	}

	return true;
};

// Assumption/Constraint validator
export const validateAssumptionConstraint = (data) => {
	const { type, description, status } = data;

	if (!type || !["ASSUMPTION", "CONSTRAINT"].includes(type)) {
		throw new APIError("Type must be either ASSUMPTION or CONSTRAINT", 400);
	}

	if (!description?.trim()) {
		throw new APIError("Description is required", 400);
	}

	if (status && !["VALID", "INVALID", "UNCERTAIN"].includes(status)) {
		throw new APIError("Invalid status value", 400);
	}

	return true;
};

// Parking Lot Item validator
export const validateParkingLotItem = (data) => {
	const { title, status, priority } = data;

	if (!title?.trim()) {
		throw new APIError("Title is required", 400);
	}

	if (status && !["PENDING", "IN_REVIEW", "RESOLVED"].includes(status)) {
		throw new APIError("Invalid status value", 400);
	}

	if (priority && !["HIGH", "MEDIUM", "LOW"].includes(priority)) {
		throw new APIError("Invalid priority value", 400);
	}

	return true;
};

// IT Resource validator
export const validateITResource = (data) => {
	const { name, type, quantity } = data;

	if (!name?.trim()) {
		throw new APIError("Resource name is required", 400);
	}

	if (!type || !["HARDWARE", "SOFTWARE", "PERSONNEL"].includes(type)) {
		throw new APIError("Type must be HARDWARE, SOFTWARE, or PERSONNEL", 400);
	}

	if (quantity !== undefined && (isNaN(quantity) || quantity < 0)) {
		throw new APIError("Quantity must be a positive number", 400);
	}

	return true;
};

// Financial validator
export const validateFinancial = (data) => {
	const { category, amount, paymentStatus } = data;

	if (!category || !["BUDGET", "EXPENSE", "REVENUE"].includes(category)) {
		throw new APIError("Category must be BUDGET, EXPENSE, or REVENUE", 400);
	}

	if (amount === undefined || isNaN(amount)) {
		throw new APIError("Valid amount is required", 400);
	}

	if (paymentStatus && !["PENDING", "PAID"].includes(paymentStatus)) {
		throw new APIError("Invalid payment status", 400);
	}

	return true;
};

// Issue/Risk validator
export const validateIssueRisk = (data) => {
	const { type, title, impact, probability, status } = data;

	if (!type || !["ISSUE", "RISK"].includes(type)) {
		throw new APIError("Type must be either ISSUE or RISK", 400);
	}

	if (!title?.trim()) {
		throw new APIError("Title is required", 400);
	}

	if (impact && !["HIGH", "MEDIUM", "LOW"].includes(impact)) {
		throw new APIError("Invalid impact value", 400);
	}

	if (probability && !["HIGH", "MEDIUM", "LOW"].includes(probability)) {
		throw new APIError("Invalid probability value", 400);
	}

	if (status && !["OPEN", "MITIGATED", "CLOSED"].includes(status)) {
		throw new APIError("Invalid status value", 400);
	}

	return true;
};

// Daily Activity validator
export const validateDailyActivity = (data) => {
	const { date, activity, status } = data;

	if (!date) {
		throw new APIError("Date is required", 400);
	}

	if (isNaN(new Date(date).getTime())) {
		throw new APIError("Invalid date format", 400);
	}

	if (!activity?.trim()) {
		throw new APIError("Activity description is required", 400);
	}

	if (status && !["PLANNED", "COMPLETED", "BLOCKED"].includes(status)) {
		throw new APIError("Invalid status value", 400);
	}

	return true;
};

// Note validator
export const validateNote = (data) => {
	const { title, content } = data;

	if (!title?.trim()) {
		throw new APIError("Title is required", 400);
	}

	if (!content?.trim()) {
		throw new APIError("Content is required", 400);
	}

	return true;
};

// Comment validator
export const validateComment = (data) => {
	const { content } = data;

	if (!content?.trim()) {
		throw new APIError("Comment content is required", 400);
	}

	return true;
};
