export type TelegramMedia = { readonly kind: "IMAGE" | "VIDEO"; readonly telegramMessageId: number; readonly fileId: string };
export type TelegramUnit = {
  readonly canonicalMessageId: number;
  readonly highestMessageId: number;
  readonly groupedId?: string;
  readonly caption: string | null;
  readonly timestamp: Date;
  readonly media: readonly TelegramMedia[];
};
export interface TelegramPage {
  readonly units: readonly TelegramUnit[];
  readonly nextCheckpoint: number;
  /** A page must only end at a complete album boundary. */
  readonly completeAlbumBoundary: true;
}
export interface TelegramHistoryPort {
  /** Returns ordered, complete content units after the supplied checkpoint. */
  getPage(peerId: string, afterMessageId: number, limit: number): Promise<TelegramPage>;
}
