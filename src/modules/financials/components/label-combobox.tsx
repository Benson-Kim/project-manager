"use client";

import { useMemo } from "react";
import { Combobox } from "@/components/ui/form/combobox";

/**
 * Pick one label of a financial's list (cost categories, funding sources) in
 * the app's dropdown. A value no longer in the list stays offered, so editing
 * an older line keeps it until changed.
 */
export function LabelCombobox({
  name,
  labels,
  value,
  onChange,
  ariaLabel,
}: {
  name: string;
  labels: readonly string[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const options = useMemo(
    () =>
      (value && !labels.includes(value) ? [...labels, value] : labels).map((label) => ({
        value: label,
        label,
      })),
    [labels, value],
  );
  return (
    <Combobox
      name={name}
      options={options}
      defaultValue={value}
      ariaLabel={ariaLabel}
      onSelect={(option) => onChange(option?.value ?? "")}
    />
  );
}
