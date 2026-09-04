import { describe, expect, it } from "vitest";
import { applyAction, startGame } from "./engine.js";
import { computeScores } from "./scoring.js";
import type { Card, GameState, Rank } from "./types.js";

function card(rank: Rank, suit: Card["suit"]): Card {
  return { id: `${rank}-${suit}`, rank, suit };
}

function seededRng(seed = 1): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

describe("Go Fish Rummy engine", () => {
  it("deals 7 cards and starts a one-card snake", () => {
    const state = startGame(
      [
        { id: "p1", name: "A" },
        { id: "p2", name: "B" },
      ],
      seededRng(),
    );
    expect(state.players[0].hand).toHaveLength(7);
    expect(state.players[1].hand).toHaveLength(7);
    expect(state.snake).toHaveLength(1);
    expect(state.phase).toBe("choose");
  });

  it("gives all matching ranks on a successful ask and continues the turn", () => {
    const state = startGame([
      { id: "p1", name: "A" },
      { id: "p2", name: "B" },
    ]);
    state.players[0].hand = [card("9", "hearts")];
    state.players[1].hand = [card("9", "spades"), card("9", "clubs"), card("2", "diamonds")];

    const next = applyAction(state, "p1", { type: "ask", targetId: "p2", rank: "9" });
    expect(next.players[0].hand.map((c) => c.rank)).toEqual(["9", "9", "9"]);
    expect(next.players[1].hand).toHaveLength(1);
    expect(next.phase).toBe("fishing");
    expect(next.currentPlayerId).toBe("p1");
    expect(next.events.some((event) => event.kind === "give")).toBe(true);
  });

  it("blocks discard during an ask streak unless it goes out", () => {
    const state = startGame([
      { id: "p1", name: "A" },
      { id: "p2", name: "B" },
    ]);
    state.players[0].hand = [card("9", "hearts"), card("5", "clubs")];
    state.players[1].hand = [card("9", "spades")];
    const fishing = applyAction(state, "p1", { type: "ask", targetId: "p2", rank: "9" });
    expect(() =>
      applyAction(fishing, "p1", { type: "discard", cardId: "5-clubs" }),
    ).toThrow(/keep asking/);
  });

  it("takes the snake from a midpoint through the tail", () => {
    const state = startGame([
      { id: "p1", name: "A" },
      { id: "p2", name: "B" },
    ]);
    state.snake = [card("7", "clubs"), card("K", "spades"), card("4", "hearts"), card("9", "diamonds")];
    state.players[0].hand = [card("2", "clubs")];

    const next = applyAction(state, "p1", { type: "takeSnake", fromIndex: 1 });
    expect(next.snake.map((c) => c.id)).toEqual(["7-clubs"]);
    expect(next.players[0].hand.map((c) => c.id)).toEqual([
      "2-clubs",
      "K-spades",
      "4-hearts",
      "9-diamonds",
    ]);
    expect(next.phase).toBe("fromSnake");
    expect(() =>
      applyAction(next, "p1", { type: "ask", targetId: "p2", rank: "2" }),
    ).toThrow(/cannot ask/);
  });

  it("only ends the game on a discard that empties the hand", () => {
    const state = startGame([
      { id: "p1", name: "A" },
      { id: "p2", name: "B" },
    ]);
    state.phase = "fromSnake";
    state.players[0].hand = [
      card("3", "hearts"),
      card("3", "spades"),
      card("3", "clubs"),
      card("8", "diamonds"),
    ];
    const melded = applyAction(state, "p1", {
      type: "playMeld",
      cardIds: ["3-hearts", "3-spades", "3-clubs"],
    });
    expect(melded.players[0].hand).toHaveLength(1);
    expect(melded.phase).not.toBe("over");

    const ended = applyAction(melded, "p1", { type: "discard", cardId: "8-diamonds" });
    expect(ended.phase).toBe("over");
    expect(ended.winnerId).toBe("p1");
    expect(ended.scores?.p1).toBe(15);
  });

  it("restricts empty-hand asks to open melds", () => {
    const state = startGame([
      { id: "p1", name: "A" },
      { id: "p2", name: "B" },
    ]);
    state.players[0].hand = [];
    state.players[1].hand = [card("9", "hearts"), card("5", "clubs")];
    state.melds = [
      {
        rank: "9",
        cards: [
          { playerId: "p2", card: card("9", "spades") },
          { playerId: "p2", card: card("9", "clubs") },
          { playerId: "p2", card: card("9", "diamonds") },
        ],
      },
    ];

    expect(() => applyAction(state, "p1", { type: "ask", targetId: "p2", rank: "5" })).toThrow(
      /open meld/,
    );
    const next = applyAction(state, "p1", { type: "ask", targetId: "p2", rank: "9" });
    expect(next.players[0].hand).toHaveLength(1);
    expect(next.phase).toBe("fishing");
  });

  it("scores table cards positive and hand cards negative", () => {
    const state = {
      players: [
        {
          id: "p1",
          name: "A",
          connected: true,
          hand: [card("A", "hearts")],
        },
        {
          id: "p2",
          name: "B",
          connected: true,
          hand: [card("2", "clubs"), card("K", "spades")],
        },
      ],
      melds: [
        {
          rank: "7",
          cards: [
            { playerId: "p1", card: card("7", "hearts") },
            { playerId: "p1", card: card("7", "spades") },
            { playerId: "p1", card: card("7", "clubs") },
          ],
        },
        {
          rank: "Q",
          cards: [
            { playerId: "p2", card: card("Q", "hearts") },
            { playerId: "p2", card: card("Q", "spades") },
            { playerId: "p2", card: card("Q", "clubs") },
          ],
        },
      ],
    } as GameState;

    const scores = computeScores(state);
    expect(scores.p1).toBe(15 - 15);
    expect(scores.p2).toBe(30 - 15);
  });
});
