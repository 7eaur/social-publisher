import test from "node:test";
import assert from "node:assert/strict";
import { assessCompatibility } from "../src/platform-policy.ts";

test("text-only Telegram item is allowed on Facebook, not Instagram", () => {
  assert.deepEqual(assessCompatibility("FACEBOOK", "TEXT"), { eligible: true });
  assert.deepEqual(assessCompatibility("INSTAGRAM", "TEXT"), {
    eligible: false, reason: "VISUAL_REQUIRED"
  });
});

test("single images, videos, and supported album types are candidates for validation", () => {
  for (const kind of ["IMAGE", "VIDEO", "IMAGE_ALBUM", "VIDEO_ALBUM"] as const) {
    assert.equal(assessCompatibility("FACEBOOK", kind).eligible, true);
    assert.equal(assessCompatibility("INSTAGRAM", kind).eligible, true);
  }
});

test("mixed albums require an explicit adapter decision for both platforms", () => {
  for (const destination of ["FACEBOOK", "INSTAGRAM"] as const) {
    assert.deepEqual(assessCompatibility(destination, "MIXED_ALBUM"), {
      eligible: false, reason: "MIXED_ALBUM_REQUIRES_VALIDATION"
    });
  }
});
