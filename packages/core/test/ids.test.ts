import test from "node:test";
import assert from "node:assert/strict";
import { publicationKey, slotKey, sourceItemKey } from "../src/ids.ts";

test("identical source messages produce stable canonical keys", () => {
  assert.equal(sourceItemKey("wasl", 123), sourceItemKey("wasl", 123));
  assert.notEqual(sourceItemKey("wasl", 123), sourceItemKey("religious", 123));
});

test("array encoding prevents route/destination delimiter collisions", () => {
  const a = publicationKey(sourceItemKey("a:b", 1), "c");
  const b = publicationKey(sourceItemKey("a", 1), "b:c");
  assert.notEqual(a, b);
  assert.notEqual(slotKey("a:b", "2026-10-13", "12:00"), slotKey("a", "2026-10-13", "12:00"));
});

test("invalid identities are rejected", () => {
  assert.throws(() => sourceItemKey("", 1), RangeError);
  assert.throws(() => sourceItemKey("x", 0), RangeError);
  assert.throws(() => sourceItemKey("x", 1.25), RangeError);
  assert.throws(() => publicationKey("ok", " "), RangeError);
  assert.throws(() => slotKey("x", "2026/10/13", "12:00"), RangeError);
});
