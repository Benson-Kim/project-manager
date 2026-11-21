# ADR-0072 — Trial ends after 112 hours of use or 14 days

Date: 2026-11-21
Status: Accepted (not enforced yet: licensing is off in every build)

## Context

Beta testers get a trial licence. A trial counted in calendar days alone does not
match how testers work: the trial should be about 8 working hours a day for 14 days.
The 14-day trial is already server-dated, so turning the PC clock back cannot
reopen it. The new hours rule must be just as hard to reset.

## Decision

1. **Whichever comes first.** A trial ends when 112 hours of use are spent or 14
   calendar days have passed since activation, whichever comes first. The 14 days
   stay tied to server time: the check-in anchor, the monotonic clock and the sealed
   mark.
2. **What counts as use.** A minute counts only while a Modulus window is focused and
   the PC has had keyboard or mouse input in the last 5 minutes. The user chose this
   ("active use only") on 2026-11-21. The meter ticks every 60 seconds on the
   monotonic clock. Each tick adds at most 2 minutes, so sleep, hibernation and
   wall-clock jumps never add or remove hours.
3. **Sealing.** The total is stored as `{ licenceId, ms, mac }`. It is HMAC-sealed with
   the install's mark key and tied to the licence id, so a new licence starts at
   zero. The local state file is saved every tick, and the SQL copy is updated at the
   next mark refresh or check-in. On start, the higher of the two copies wins. A
   tampered or unreadable counter counts as used up.
4. **The service keeps the highest value.** Each check-in sends `usedMs`. The licence
   service stores the highest value it has seen for each licence
   (`MAX(used_ms, ?)`) and signs that value into the check-in reply. The desktop
   keeps the highest of the file, the SQL copy and the service value. Putting back an
   old state file and an old SQL row therefore no longer resets the hours after a
   check-in, and a lower value from a client never lowers the stored total.
5. **The limit is signed.** The service signs `usageLimitMs` into the licence: 112 h
   for trials and null otherwise. The desktop reads the limit from the licence.
   `TRIAL_USAGE_LIMIT` is used only for licences signed before this claim existed.
   Editing the limit breaks the signature.
6. **After expiry.** The server gate blocks changes. Viewing and exporting stay open.

## Consequences

- Hours used offline are counted locally and reach the service at the next check-in.
  A reset made while offline is caught at the next check-in, but not before.
- Deploy order: apply service migration `0002_licence_used_ms.sql` and deploy the
  service before shipping a desktop build that enforces licensing. Older desktops
  ignore the new fields. If the service has not been updated, the desktop falls back
  to 112 h and to the file and SQL values.
- A different trial length for one licence needs only a change in the service.

## Alternatives rejected

- **Counting all the time the app is open.** An app left open overnight would use up
  the trial in under 5 days.
- **Calendar days only.** This does not match working hours.
- **The limit as a desktop constant only.** It could not differ per licence, and
  changing it would need a desktop release.
