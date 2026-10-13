import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransition, isEligibleForAutomatedClaim, isTerminal, transition
} from "../src/publication.ts";

test("normal publication path requires a reservation and submitting state", () => {
  assert.equal(transition("PENDING", "RESERVED"), "RESERVED");
  assert.equal(transition("RESERVED", "SUBMITTING"), "SUBMITTING");
  assert.equal(transition("SUBMITTING", "CONFIRMED"), "CONFIRMED");
  assert.equal(isTerminal("CONFIRMED"), true);
});

test("uncertain external outcome is not automatically claimable", () => {
  assert.equal(transition("SUBMITTING", "UNCERTAIN"), "UNCERTAIN");
  assert.equal(isEligibleForAutomatedClaim("UNCERTAIN"), false);
  assert.equal(canTransition("UNCERTAIN", "RESERVED"), false);
  assert.throws(() => transition("UNCERTAIN", "RESERVED"), /Invalid publication/);
  assert.equal(transition("UNCERTAIN", "CONFIRMED"), "CONFIRMED");
});

test("known retryable failures can be claimed, terminal states cannot", () => {
  assert.equal(isEligibleForAutomatedClaim("RETRYABLE_FAILURE"), true);
  assert.equal(transition("RETRYABLE_FAILURE", "RESERVED"), "RESERVED");
  assert.equal(isEligibleForAutomatedClaim("PERMANENT_FAILURE"), false);
  assert.equal(isEligibleForAutomatedClaim("CONFIRMED"), false);
  assert.equal(isTerminal("SKIPPED_UNSUPPORTED"), true);
  assert.throws(() => transition("CONFIRMED", "SUBMITTING"), /Invalid publication/);
});

test("a platform skip does not affect other destination's state", () => {
  const instagram = transition("PENDING", "SKIPPED_UNSUPPORTED");
  const facebook = transition("PENDING", "RESERVED");
  assert.equal(instagram, "SKIPPED_UNSUPPORTED");
  assert.equal(facebook, "RESERVED");
});
