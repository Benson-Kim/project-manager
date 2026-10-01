"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";

/**
 * Parking lot toolbar: search + resolved/active filter + view toggle.
 * Filter values sync to URL and are server-read by the list page.
 */
export function ParkingLotToolbar({ children }: { children?: React.ReactNode }) {
  const { searchParams, update } = useListUrlState();
  const status = searchParams.get("status") ?? "";

  return (
    <Toolbar>
      <SearchInput testId="parking-lot-search" />
      <select
        key={status}
        aria-label={messages.parkingLot.allStatuses}
        value={status}
        onChange={(e) => update({ status: e.target.value || null, page: null })}
        className="min-h-11 rounded-md border border-line bg-surface px-3 text-sm text-ink"
      >
        <option value="">{messages.parkingLot.allStatuses}</option>
        <option value="active">{messages.parkingLot.active}</option>
        <option value="resolved">{messages.parkingLot.resolved}</option>
      </select>
      {children}
    </Toolbar>
  );
}
