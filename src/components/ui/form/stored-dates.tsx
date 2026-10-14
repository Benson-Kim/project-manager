import { storedDates } from "@/lib/date-range";

/**
 * Hidden inputs with a record's dates as stored, for an update form whose
 * schema checks date order (datesInOrder, datesWere): a pair left as stored
 * passes even when a record from before the rule has it inverted.
 */
export function StoredDates({ dates }: { dates: Record<string, Date | null | undefined> }) {
  return (
    <>
      {Object.entries(storedDates(dates)).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}
