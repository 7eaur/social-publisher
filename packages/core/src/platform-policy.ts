/** Adapter-level media validation is required before any real publication. */
export type Destination = "FACEBOOK" | "INSTAGRAM";
export type ContentKind =
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "IMAGE_ALBUM"
  | "VIDEO_ALBUM"
  | "MIXED_ALBUM";

export type CompatibilityResult =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason: "VISUAL_REQUIRED" | "MIXED_ALBUM_REQUIRES_VALIDATION";
    };

const validDestinations: ReadonlySet<string> = new Set(["FACEBOOK", "INSTAGRAM"]);
const validContentKinds: ReadonlySet<string> = new Set([
  "TEXT", "IMAGE", "VIDEO", "IMAGE_ALBUM", "VIDEO_ALBUM", "MIXED_ALBUM"
]);

export function assessCompatibility(
  destination: Destination,
  kind: ContentKind
): CompatibilityResult {
  if (!validDestinations.has(destination)) {
    throw new RangeError("Unknown destination");
  }
  if (!validContentKinds.has(kind)) {
    throw new RangeError("Unknown content kind");
  }
  // No adapter should silently discard media in a mixed album.
  if (kind === "MIXED_ALBUM") {
    return { eligible: false, reason: "MIXED_ALBUM_REQUIRES_VALIDATION" };
  }
  if (destination === "INSTAGRAM" && kind === "TEXT") {
    return { eligible: false, reason: "VISUAL_REQUIRED" };
  }
  // Eligible here only means the kind is a candidate; provider validation of
  // duration, encoding, account permissions, file count and sizes is mandatory.
  return { eligible: true };
}
