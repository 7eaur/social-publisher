/** Canonical identity values; array JSON encoding avoids delimiter collisions. */
function nonBlank(value: string, field: string): string {
  if (!value.trim()) {
    throw new RangeError(field + " must not be blank");
  }
  return value;
}

export function sourceItemKey(sourceId: string, canonicalMessageId: number): string {
  nonBlank(sourceId, "sourceId");
  if (!Number.isSafeInteger(canonicalMessageId) || canonicalMessageId <= 0) {
    throw new RangeError("canonicalMessageId must be a positive safe integer");
  }
  return JSON.stringify(["telegram", sourceId, canonicalMessageId]);
}

export function publicationKey(itemKey: string, destinationId: string): string {
  nonBlank(itemKey, "itemKey");
  nonBlank(destinationId, "destinationId");
  return JSON.stringify([itemKey, destinationId]);
}

/**
 * This is an identity only, NOT a database lock. Phase 02 must enforce a
 * unique(routeId, localDate, slot) index transactionally.
 */
export function slotKey(routeId: string, localDate: string, slot: string): string {
  nonBlank(routeId, "routeId");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new RangeError("localDate must be YYYY-MM-DD");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot)) {
    throw new RangeError("slot must be HH:mm in 24-hour time");
  }
  return JSON.stringify([routeId, localDate, slot]);
}
