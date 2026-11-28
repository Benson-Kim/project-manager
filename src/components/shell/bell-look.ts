export interface BellLook {
  /** Filled while anything is listed, outline when the list is empty. */
  state: "filled" | "outline";
  /** An alarm whose time has come turns the whole bell red until it is dealt with. */
  ringing: boolean;
  count: number;
}

export function bellLook(alertCount: number, alarmCount: number): BellLook {
  const count = alertCount + alarmCount;
  return { state: count > 0 ? "filled" : "outline", ringing: alarmCount > 0, count };
}
