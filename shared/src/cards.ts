import { RANKS, SUITS, type Card, type Rank } from "./types.js";

export function createDeck(): Card[] {
  return RANKS.flatMap((rank) =>
    SUITS.map((suit) => ({
      id: `${rank}-${suit}`,
      rank,
      suit,
    })),
  );
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function cardPoints(card: Card): number {
  if (card.rank === "A") return 15;
  if (card.rank === "10" || card.rank === "J" || card.rank === "Q" || card.rank === "K") {
    return 10;
  }
  return 5;
}

export function rankLabel(rank: Rank): string {
  return rank;
}
