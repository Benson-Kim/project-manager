"use client";

import { createContext, useContext, useId } from "react";

/**
 * Field wiring ): always-visible label, inline error below, ids and
 * aria attributes shared with the input through context. No helper text —
 * the label carries the meaning.
 */
interface FieldContextValue {
  inputId: string;
  errorId: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: string;
  /** Field name — used to look up errors. */
  name: string;
  errors?: string[];
  children: React.ReactNode;
}

export function Field({ label, name, errors, children }: FieldProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const errorId = `${id}-error`;
  const invalid = Boolean(errors && errors.length > 0);

  return (
    <FieldContext.Provider value={{ inputId, errorId, invalid }}>
      <div className="flex flex-col gap-1" data-field={name}>
        <label htmlFor={inputId} className="text-sm text-ink leading-6">
          {label}
        </label>
        {children}
        {invalid ? (
          <p id={errorId} className="text-sm text-danger">
            {errors?.[0]}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

/** Shared props for inputs living inside a Field. */
export function useFieldAria() {
  const field = useFieldContext();
  if (!field) return {};
  return {
    id: field.inputId,
    "aria-invalid": field.invalid || undefined,
    "aria-describedby": field.invalid ? field.errorId : undefined,
  };
}
