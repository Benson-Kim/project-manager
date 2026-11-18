import { allowsChanges, currentLicenceStatus } from "./gate";

export async function refuseIfReadOnly(): Promise<boolean> {
  return !allowsChanges(await currentLicenceStatus());
}
