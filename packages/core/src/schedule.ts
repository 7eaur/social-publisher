import { slotKey } from "./ids.ts";

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // Monday = 1

export interface ScheduleRule {
  readonly routeId: string;
  readonly enabled: boolean;
  readonly timeZone: string; // IANA time zone, e.g. Asia/Aden
  readonly isoWeekdays: readonly IsoWeekday[];
  readonly slots: readonly string[]; // HH:mm
  readonly dailyLimit: number;
}

export interface DueSlot {
  readonly routeId: string;
  readonly localDate: string; // date in the route time zone
  readonly slot: string;
  readonly claimKey: string;
}

const weekdayByName: Readonly<Record<string, IsoWeekday>> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7
};

function localClock(date: Date, timeZone: string): {
  localDate: string;
  slot: string;
  weekday: IsoWeekday;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = new Map(
    formatter.formatToParts(date).map(({ type, value }) => [type, value])
  );
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = parts.get("hour");
  const minute = parts.get("minute");
  const weekday = weekdayByName[parts.get("weekday") ?? ""];
  if (!year || !month || !day || !hour || !minute || !weekday) {
    throw new Error("Unable to resolve schedule time zone parts");
  }
  return {
    localDate: year + "-" + month + "-" + day,
    slot: hour + ":" + minute,
    weekday
  };
}

export function validateScheduleRule(rule: ScheduleRule): void {
  if (!rule.routeId.trim()) throw new RangeError("routeId must not be empty");
  if (!rule.timeZone.trim()) throw new RangeError("timeZone must not be empty");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: rule.timeZone });
  } catch {
    throw new RangeError("Invalid IANA time zone: " + rule.timeZone);
  }
  if (
    rule.isoWeekdays.length === 0 ||
    new Set(rule.isoWeekdays).size !== rule.isoWeekdays.length ||
    rule.isoWeekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)
  ) {
    throw new RangeError("isoWeekdays must contain unique integers from 1 through 7");
  }
  if (
    rule.slots.length === 0 ||
    new Set(rule.slots).size !== rule.slots.length ||
    rule.slots.some(slot => !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot))
  ) {
    throw new RangeError("slots must contain unique HH:mm values");
  }
  if (
    !Number.isSafeInteger(rule.dailyLimit) ||
    rule.dailyLimit < 1 ||
    rule.dailyLimit > rule.slots.length
  ) {
    throw new RangeError("dailyLimit must be between 1 and configured slot count");
  }
}

/**
 * Pure current-minute evaluator. Reserved counts/slots MUST come from a
 * transactionally consistent DB read and claim in Phase 04.
 *
 * Late/missed-slot catch-up is intentionally not done here.
 */
export function getDueSlot(
  rule: ScheduleRule,
  now: Date,
  reservedCountForLocalDay: number,
  reservedSlotsForLocalDay: ReadonlySet<string>
): DueSlot | null {
  validateScheduleRule(rule);
  if (Number.isNaN(now.getTime())) throw new RangeError("Invalid date");
  if (!Number.isSafeInteger(reservedCountForLocalDay) || reservedCountForLocalDay < 0) {
    throw new RangeError("reservedCountForLocalDay must be non-negative integer");
  }
  if (!rule.enabled || reservedCountForLocalDay >= rule.dailyLimit) return null;
  const clock = localClock(now, rule.timeZone);
  if (!rule.isoWeekdays.includes(clock.weekday)) return null;
  if (!rule.slots.includes(clock.slot)) return null;
  if (reservedSlotsForLocalDay.has(clock.slot)) return null;

  return {
    routeId: rule.routeId,
    localDate: clock.localDate,
    slot: clock.slot,
    claimKey: slotKey(rule.routeId, clock.localDate, clock.slot)
  };
}
