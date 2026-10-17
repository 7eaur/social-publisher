import type { TelegramUnit } from "./types.ts";
export type ContentKind = "TEXT"|"IMAGE"|"VIDEO"|"IMAGE_ALBUM"|"VIDEO_ALBUM"|"MIXED_ALBUM";
export function classify(unit: TelegramUnit): ContentKind {
  if (unit.media.length === 0) return "TEXT";
  if (unit.media.length === 1) return unit.media[0]!.kind;
  const kinds = new Set(unit.media.map(m => m.kind));
  return kinds.size > 1 ? "MIXED_ALBUM" : kinds.has("IMAGE") ? "IMAGE_ALBUM" : "VIDEO_ALBUM";
}
export function validatePage(units: readonly TelegramUnit[], afterId: number, nextCheckpoint: number): void {
  if (!Number.isSafeInteger(afterId) || afterId < 0) throw new RangeError("Invalid checkpoint");
  if (!Number.isSafeInteger(nextCheckpoint) || nextCheckpoint < afterId) throw new RangeError("Regressing checkpoint");
  let previous = afterId;
  for (const unit of units) {
    if (!Number.isSafeInteger(unit.canonicalMessageId) || unit.canonicalMessageId <= previous ||
        !Number.isSafeInteger(unit.highestMessageId) || unit.highestMessageId < unit.canonicalMessageId ||
        unit.highestMessageId > nextCheckpoint || Number.isNaN(unit.timestamp.getTime())) {
      throw new RangeError("Invalid or overlapping Telegram unit");
    }
    if (unit.groupedId !== undefined && !unit.groupedId.trim()) throw new RangeError("Empty grouped id");
    const mediaIds = new Set<number>();
    for (const media of unit.media) {
      if (!Number.isSafeInteger(media.telegramMessageId) ||
          media.telegramMessageId < unit.canonicalMessageId ||
          media.telegramMessageId > unit.highestMessageId ||
          mediaIds.has(media.telegramMessageId) || !media.fileId.trim()) {
        throw new RangeError("Malformed or duplicate album media");
      }
      mediaIds.add(media.telegramMessageId);
    }
    previous = unit.highestMessageId;
  }
  if (units.length === 0 && nextCheckpoint !== afterId) {
    throw new RangeError("Empty page cannot advance checkpoint without explicit skipped-message accounting");
  }
}
