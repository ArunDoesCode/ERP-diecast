// The plant's calendar day is the day in IST (Asia/Kolkata), whatever zone the
// server runs in. Built-in Intl only. A full timestamp counts as the IST day
// it falls in; a bare date ("2026-10-01" = midnight UTC) is 05:30 IST that
// same day, so it reads as that calendar day.
const DAY_MS = 86_400_000;

const istParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The IST calendar day of `date` as YYYY-MM-DD. */
export function istDayKey(date: Date = new Date()): string {
  const parts = Object.fromEntries(
    istParts.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The IST calendar month of `date` as YYYY-MM (document number period). */
export function istMonthKey(date: Date = new Date()): string {
  return istDayKey(date).slice(0, 7);
}

/** The IST calendar day of `date` as a Date at 00:00 UTC of that day. */
export function istDayStart(date: Date = new Date()): Date {
  return new Date(`${istDayKey(date)}T00:00:00.000Z`);
}

/** Whole IST days from `from` to `to` (negative when `to` is earlier). */
export function istDaysBetween(from: Date, to: Date): number {
  return Math.round(
    (istDayStart(to).getTime() - istDayStart(from).getTime()) / DAY_MS,
  );
}
