"use client";

import { ListFilter } from "@/components/ui/data-view/list-filter";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Parking lot toolbar: search + status filter (managed list, migration 031) +
 * view toggle. Filter values sync to the URL and are server-read by the list page.
 */
export function ParkingLotToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      <SearchInput testId="parking-lot-search" />
      <ListFilter
        list="parking-lot-item.status"
        param="status"
        label={messages.parkingLot.status}
        allLabel={messages.parkingLot.allStatuses}
        testId="filter-status"
      />
      {children}
    </Toolbar>
  );
}
