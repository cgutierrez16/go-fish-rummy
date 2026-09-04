import type { PublicPlayer } from "@gfr/shared";

export type SeatSlot = "north" | "west" | "east";

export function opponentSeats(
  players: PublicPlayer[],
  youId: string,
): Partial<Record<SeatSlot, PublicPlayer>> {
  const youIndex = players.findIndex((player) => player.id === youId);
  if (youIndex < 0) return {};
  const clockwise: PublicPlayer[] = [];
  for (let step = 1; step < players.length; step++) {
    clockwise.push(players[(youIndex + step) % players.length]);
  }
  if (clockwise.length === 1) return { north: clockwise[0] };
  if (clockwise.length === 2) return { west: clockwise[0], east: clockwise[1] };
  return { west: clockwise[0], north: clockwise[1], east: clockwise[2] };
}
