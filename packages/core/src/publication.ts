/**
 * Publishing state machine: an unknown external result is NEVER retried
 * automatically. The infrastructure adapter must prove no remote publish
 * before it can label an attempt RETRYABLE_FAILURE.
 */
export type PublicationState =
  | "PENDING"
  | "RESERVED"
  | "SUBMITTING"
  | "CONFIRMED"
  | "SKIPPED_UNSUPPORTED"
  | "RETRYABLE_FAILURE"
  | "PERMANENT_FAILURE"
  | "UNCERTAIN";

const allowed: Readonly<Record<PublicationState, readonly PublicationState[]>> = {
  PENDING: ["RESERVED", "SKIPPED_UNSUPPORTED"],
  RESERVED: ["SUBMITTING", "RETRYABLE_FAILURE", "PERMANENT_FAILURE"],
  SUBMITTING: ["CONFIRMED", "RETRYABLE_FAILURE", "PERMANENT_FAILURE", "UNCERTAIN"],
  CONFIRMED: [],
  SKIPPED_UNSUPPORTED: [],
  RETRYABLE_FAILURE: ["RESERVED", "PERMANENT_FAILURE"],
  PERMANENT_FAILURE: [],
  UNCERTAIN: ["CONFIRMED", "RETRYABLE_FAILURE", "PERMANENT_FAILURE"]
};

export function canTransition(from: PublicationState, to: PublicationState): boolean {
  return allowed[from].includes(to);
}

export function transition(from: PublicationState, to: PublicationState): PublicationState {
  if (!canTransition(from, to)) {
    throw new Error("Invalid publication state transition: " + from + " -> " + to);
  }
  return to;
}

export function isTerminal(state: PublicationState): boolean {
  return state === "CONFIRMED" || state === "SKIPPED_UNSUPPORTED" || state === "PERMANENT_FAILURE";
}

/** Advisory only. An atomic claim and platform-safe error classification are required. */
export function isEligibleForAutomatedClaim(state: PublicationState): boolean {
  return state === "PENDING" || state === "RETRYABLE_FAILURE";
}
