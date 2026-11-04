import { EDIT_LIST } from "../lookup-lists";

interface SelectLike {
  value: string;
  options: ArrayLike<{ value: string; defaultSelected: boolean }>;
}

/**
 * The option a select shows, never "Edit list…". Hydration keeps a choice made before it,
 * so a select picked early can read EDIT_LIST; its default option stands in then.
 */
export function shownOption(select: SelectLike): string {
  if (select.value !== EDIT_LIST) return select.value;
  return (
    Array.from(select.options).find((o) => o.defaultSelected && o.value !== EDIT_LIST)?.value ?? ""
  );
}
