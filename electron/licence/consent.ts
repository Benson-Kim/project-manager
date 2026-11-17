export interface ConsentForm {
  testimonial: boolean;
  named: boolean;
  quote: string;
  displayName: string;
}

export interface ConsentChoice {
  kind: "testimonial" | "name";
  granted: boolean;
  quote: string;
  displayName: string | null;
}

export const nameAllowed = (form: Pick<ConsentForm, "testimonial" | "quote">): boolean =>
  form.testimonial && form.quote.trim() !== "";

export function consentChoices(
  form: ConsentForm,
): { error: string } | { choices: ConsentChoice[] } {
  const quote = form.quote.trim();
  const displayName = form.displayName.trim();
  const named = form.named && nameAllowed(form);
  if (form.testimonial && !quote) return { error: "Write the words you're happy for us to quote." };
  if (named && !displayName) return { error: "Enter the name to show." };
  return {
    choices: [
      {
        kind: "testimonial",
        granted: form.testimonial,
        quote: form.testimonial ? quote : "",
        displayName: null,
      },
      { kind: "name", granted: named, quote: "", displayName: named ? displayName : null },
    ],
  };
}
