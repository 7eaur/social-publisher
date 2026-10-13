import test from "node:test";
import assert from "node:assert/strict";
import { getDueSlot, validateScheduleRule, type ScheduleRule } from "../src/schedule.ts";

const rule: ScheduleRule = {
  routeId: "wasl",
  enabled: true,
  timeZone: "Asia/Aden",
  isoWeekdays: [1, 3, 5],
  slots: ["09:15", "19:30"],
  dailyLimit: 1
};

test("Aden local time, not UTC server time, decides publishing slot", () => {
  const due = getDueSlot(rule, new Date("2026-10-12T06:15:30Z"), 0, new Set());
  assert.equal(due?.localDate, "2026-10-12");
  assert.equal(due?.slot, "09:15");
  assert.ok(due?.claimKey);
  assert.equal(getDueSlot(rule, new Date("2026-10-12T09:15:00Z"), 0, new Set()), null);
});

test("weekdays are evaluated in local timezone across UTC date boundaries", () => {
  const overnight: ScheduleRule = { ...rule, slots: ["00:30"], isoWeekdays: [1] };
  const due = getDueSlot(overnight, new Date("2026-10-11T21:30:00Z"), 0, new Set());
  assert.equal(due?.localDate, "2026-10-12");
});

test("already claimed slots and daily caps never generate another due item", () => {
  const when = new Date("2026-10-12T06:15:00Z");
  assert.equal(getDueSlot(rule, when, 1, new Set()), null);
  assert.equal(getDueSlot(rule, when, 0, new Set(["09:15"])), null);
  assert.equal(getDueSlot({ ...rule, enabled: false }, when, 0, new Set()), null);
});

test("distinct streams have different slot identities", () => {
  const religious: ScheduleRule = { ...rule, routeId: "religious" };
  const when = new Date("2026-10-12T06:15:00Z");
  assert.notEqual(
    getDueSlot(rule, when, 0, new Set())?.claimKey,
    getDueSlot(religious, when, 0, new Set())?.claimKey
  );
});

test("DST repeated local slot uses the same local-day claim key", () => {
  const ny: ScheduleRule = {
    ...rule, routeId: "dst", timeZone: "America/New_York",
    isoWeekdays: [7], slots: ["01:30"]
  };
  const earlier = getDueSlot(ny, new Date("2026-11-01T05:30:00Z"), 0, new Set());
  const later = getDueSlot(ny, new Date("2026-11-01T06:30:00Z"), 0, new Set());
  assert.equal(earlier?.claimKey, later?.claimKey);
  assert.equal(later?.localDate, "2026-11-01");
});

test("invalid or ambiguous schedule configuration fails fast", () => {
  assert.throws(() => validateScheduleRule({ ...rule, timeZone: "Mars/Olympus" }), RangeError);
  assert.throws(() => validateScheduleRule({ ...rule, slots: ["09:15", "09:15"] }), RangeError);
  assert.throws(() => validateScheduleRule({ ...rule, slots: ["25:60"] }), RangeError);
  assert.throws(() => validateScheduleRule({ ...rule, isoWeekdays: [1, 1] }), RangeError);
  assert.throws(() => validateScheduleRule({ ...rule, dailyLimit: 3 }), RangeError);
  assert.throws(() => getDueSlot(rule, new Date("invalid"), 0, new Set()), RangeError);
  assert.throws(() => getDueSlot(rule, new Date(), -1, new Set()), RangeError);
});
