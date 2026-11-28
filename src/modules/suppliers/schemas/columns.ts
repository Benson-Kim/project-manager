import { columnSchemaFor } from "@/lib/custom-columns/register";
import { messages } from "@/lib/messages";

const M = messages.suppliers;

export const SUPPLIER_BUILT_IN_COLUMNS = [
  { key: "SupplierName", name: M.supplierName },
  { key: "ContractEndDate", name: M.contractEndDate },
  { key: "ContactPerson", name: M.contactPerson },
  { key: "Rating", name: M.rating },
  { key: "City", name: M.city },
  { key: "EmailAddress", name: M.emailAddress },
] as const;

export const supplierColumnSchema = columnSchemaFor("Supplier");
