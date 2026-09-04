import { cardPoints } from "./cards.js";
import type { GameState } from "./types.js";

export function computeScores(state: GameState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const player of state.players) {
    const table = state.melds
      .flatMap((meld) => meld.cards)
      .filter((played) => played.playerId === player.id)
      .reduce((sum, played) => sum + cardPoints(played.card), 0);
    const hand = player.hand.reduce((sum, card) => sum + cardPoints(card), 0);
    scores[player.id] = table - hand;
  }
  return scores;
}
