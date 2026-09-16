import type { Seat } from "./types";

export interface SeatLabels {
  a: string;
  b: string;
  /** Lower-case forms for mid-sentence use. */
  aInline: string;
  bInline: string;
}

/**
 * Who "you" and "them" refer to depends on which seat is looking.
 *
 * A spectator (FR-8.2) holds no seat, so calling either side "you" would be a
 * lie — they get neutral labels instead.
 */
export function seatLabels(yourSeat: Seat | null): SeatLabels {
  if (yourSeat === "A") return { a: "You", b: "Them", aInline: "you", bInline: "them" };
  if (yourSeat === "B") return { a: "Them", b: "You", aInline: "them", bInline: "you" };
  return { a: "Person A", b: "Person B", aInline: "person A", bInline: "person B" };
}
