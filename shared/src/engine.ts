import { createDeck, shuffle } from "./cards.js";
import { computeScores } from "./scoring.js";
import type {
  Card,
  ClientAction,
  GameState,
  Player,
  Rank,
  VisualEvent,
} from "./types.js";

const HAND_SIZE = 7;

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalMoveError";
  }
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function playerById(state: GameState, id: string): Player {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new IllegalMoveError("Player not found.");
  return player;
}

function assertCurrent(state: GameState, playerId: string): Player {
  if (state.phase === "over") throw new IllegalMoveError("The game is over.");
  if (state.currentPlayerId !== playerId) {
    throw new IllegalMoveError("It is not your turn.");
  }
  return playerById(state, playerId);
}

function takeFromHand(player: Player, cardIds: string[]): Card[] {
  const taken: Card[] = [];
  for (const id of cardIds) {
    const index = player.hand.findIndex((card) => card.id === id);
    if (index === -1) throw new IllegalMoveError("You do not have that card.");
    taken.push(player.hand.splice(index, 1)[0]);
  }
  return taken;
}

function openMeldRanks(state: GameState): Rank[] {
  return state.melds.filter((meld) => meld.cards.length === 3).map((meld) => meld.rank);
}

function canAskRank(state: GameState, player: Player, rank: Rank): boolean {
  if (player.hand.length === 0) {
    return openMeldRanks(state).includes(rank);
  }
  return true;
}

function refillStock(state: GameState): void {
  if (state.stock.length > 0 || state.snake.length <= 1) return;
  const head = state.snake.slice(0, -1);
  const tail = state.snake[state.snake.length - 1];
  state.stock = shuffle(head);
  state.snake = [tail];
}

function log(state: GameState, text: string): void {
  state.log.push({ text });
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}

function beginEvents(state: GameState): void {
  state.eventSeq += 1;
  state.events = [];
}

function emit(state: GameState, event: Omit<VisualEvent, "id">): void {
  state.events.push({
    ...event,
    id: `${state.eventSeq}-${state.events.length}`,
  });
}

function endGame(state: GameState, winnerId: string): void {
  state.phase = "over";
  state.winnerId = winnerId;
  state.scores = computeScores(state);
  const winner = playerById(state, winnerId);
  log(state, `${winner.name} went out on a discard. Hand over.`);
  emit(state, {
    kind: "goOut",
    tone: "alert",
    title: `${winner.name} went out`,
    detail: "Scores are based on table cards minus leftover hand.",
    fromId: winnerId,
    faceUp: false,
  });
}

export function startGame(
  players: { id: string; name: string }[],
  rng: () => number = Math.random,
): GameState {
  if (players.length < 2 || players.length > 4) {
    throw new IllegalMoveError("Go Fish Rummy is for 2 to 4 players with one deck.");
  }

  let stock = shuffle(createDeck(), rng);
  const seated: Player[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    hand: stock.splice(0, HAND_SIZE),
    connected: true,
  }));
  const snakeStart = stock.shift();
  if (!snakeStart) throw new IllegalMoveError("Deck is too small.");

  const state: GameState = {
    players: seated,
    stock,
    snake: [snakeStart],
    melds: [],
    currentPlayerId: seated[0].id,
    phase: "choose",
    lastAsk: null,
    winnerId: null,
    scores: null,
    log: [{ text: `${seated[0].name} goes first. The snake starts with ${snakeStart.rank}.` }],
    turnNumber: 1,
    eventSeq: 1,
    events: [
      {
        id: "deal-0",
        kind: "deal",
        tone: "info",
        title: `${seated[0].name} goes first`,
        detail: `The snake starts with a ${snakeStart.rank}.`,
        toId: "snake",
        cards: [snakeStart],
        faceUp: true,
      },
    ],
  };
  return state;
}

function playMeld(state: GameState, playerId: string, cardIds: string[]): GameState {
  const next = cloneState(state);
  const player = assertCurrent(next, playerId);
  if (cardIds.length < 3) throw new IllegalMoveError("A meld needs at least three cards.");
  const cards = takeFromHand(player, cardIds);
  const rank = cards[0].rank;
  if (cards.some((card) => card.rank !== rank)) {
    throw new IllegalMoveError("Melds are sets of the same rank only. No runs.");
  }
  if (next.melds.some((meld) => meld.rank === rank)) {
    throw new IllegalMoveError("That rank is already on the table. Add to the existing meld.");
  }
  beginEvents(next);
  next.melds.push({
    rank,
    cards: cards.map((card) => ({ card, playerId })),
  });
  log(next, `${player.name} laid down ${cards.length} ${rank}s.`);
  emit(next, {
    kind: "meld",
    tone: "success",
    title: `${player.name} laid down ${rank}s`,
    detail: `${cards.length} of a kind`,
    fromId: playerId,
    toId: "melds",
    rank,
    count: cards.length,
    cards,
    faceUp: true,
  });
  return next;
}

function addToMeld(
  state: GameState,
  playerId: string,
  meldIndex: number,
  cardIds: string[],
): GameState {
  const next = cloneState(state);
  const player = assertCurrent(next, playerId);
  const meld = next.melds[meldIndex];
  if (!meld) throw new IllegalMoveError("That meld does not exist.");
  if (cardIds.length === 0) throw new IllegalMoveError("Select cards to add.");
  const cards = takeFromHand(player, cardIds);
  if (cards.some((card) => card.rank !== meld.rank)) {
    throw new IllegalMoveError("Those cards do not match this meld.");
  }
  if (meld.cards.length + cards.length > 4) {
    throw new IllegalMoveError("A set can only have four cards.");
  }
  beginEvents(next);
  meld.cards.push(...cards.map((card) => ({ card, playerId })));
  log(next, `${player.name} added ${cards.length} ${meld.rank}(s) to the table.`);
  emit(next, {
    kind: "add",
    tone: "success",
    title: `${player.name} added to the ${meld.rank}s`,
    fromId: playerId,
    toId: "melds",
    rank: meld.rank,
    count: cards.length,
    cards,
    faceUp: true,
  });
  return next;
}

function ask(state: GameState, playerId: string, targetId: string, rank: Rank): GameState {
  const next = cloneState(state);
  const player = assertCurrent(next, playerId);

  if (next.phase === "fromSnake") {
    throw new IllegalMoveError("You took from the snake, so you cannot ask this turn.");
  }
  if (next.phase === "goFishDiscard") {
    throw new IllegalMoveError("You missed. Discard to end your turn.");
  }
  if (next.phase !== "choose" && next.phase !== "fishing") {
    throw new IllegalMoveError("You cannot ask right now.");
  }
  if (targetId === playerId) throw new IllegalMoveError("You cannot ask yourself.");
  const target = playerById(next, targetId);
  if (!canAskRank(next, player, rank)) {
    throw new IllegalMoveError(
      "With an empty hand you may only ask for a rank that is an open meld (three on the table, fourth still out).",
    );
  }

  next.lastAsk = { targetId, rank };
  const stolen = target.hand.filter((card) => card.rank === rank);
  target.hand = target.hand.filter((card) => card.rank !== rank);
  beginEvents(next);
  emit(next, {
    kind: "ask",
    tone: "info",
    title: `${player.name} asked ${target.name}`,
    detail: `for ${rank}s`,
    fromId: playerId,
    toId: targetId,
    rank,
    faceUp: false,
  });

  if (stolen.length > 0) {
    player.hand.push(...stolen);
    next.phase = "fishing";
    log(
      next,
      `${player.name} asked ${target.name} for ${rank}s and got ${stolen.length}. Turn continues.`,
    );
    emit(next, {
      kind: "give",
      tone: "success",
      title: `${target.name} handed them over`,
      detail: `${stolen.length} ${rank}${stolen.length === 1 ? "" : "s"}`,
      fromId: targetId,
      toId: playerId,
      rank,
      count: stolen.length,
      cards: stolen,
      faceUp: true,
    });
    return next;
  }

  log(next, `${player.name} asked ${target.name} for ${rank}s. Go fish.`);
  emit(next, {
    kind: "goFish",
    tone: "miss",
    title: "Go fish",
    detail: `${target.name} had no ${rank}s`,
    fromId: "stock",
    toId: playerId,
    rank,
    faceUp: false,
  });
  refillStock(next);
  const drawn = next.stock.shift();
  if (!drawn) {
    next.phase = "goFishDiscard";
    log(next, "The stock is empty. Discard to end your turn.");
    return next;
  }

  if (drawn.rank === rank) {
    player.hand.push(drawn);
    next.phase = "fishing";
    log(next, `${player.name} fished the ${drawn.rank} they asked for. Turn continues.`);
    emit(next, {
      kind: "fishHit",
      tone: "success",
      title: `${player.name} fished a ${rank}`,
      detail: "They drew the rank they asked for.",
      fromId: "stock",
      toId: playerId,
      rank,
      count: 1,
      cards: [drawn],
      faceUp: true,
    });
    return next;
  }

  player.hand.push(drawn);
  next.phase = "goFishDiscard";
  log(next, `${player.name} did not fish a ${rank}. Discard to end the turn.`);
  emit(next, {
    kind: "fishMiss",
    tone: "miss",
    title: `${player.name} did not fish a ${rank}`,
    fromId: "stock",
    toId: playerId,
    rank,
    count: 1,
    cards: [drawn],
    faceUp: false,
  });
  return next;
}

function takeSnake(state: GameState, playerId: string, fromIndex: number): GameState {
  const next = cloneState(state);
  const player = assertCurrent(next, playerId);

  if (next.phase !== "choose") {
    throw new IllegalMoveError("You can only take from the snake at the start of your turn.");
  }
  if (next.snake.length === 0) throw new IllegalMoveError("The snake is empty.");
  if (fromIndex < 0 || fromIndex >= next.snake.length) {
    throw new IllegalMoveError("That is not a card on the snake.");
  }

  const taken = next.snake.splice(fromIndex);
  player.hand.push(...taken);
  next.phase = "fromSnake";
  next.lastAsk = null;
  beginEvents(next);
  const start = taken[0];
  log(
    next,
    taken.length === 1
      ? `${player.name} took the tail (${start.rank}) from the snake.`
      : `${player.name} took ${taken.length} cards from the snake, starting at ${start.rank}.`,
  );
  emit(next, {
    kind: "takeSnake",
    tone: "info",
    title: `${player.name} took the snake`,
    detail:
      taken.length === 1
        ? `Picked up the tail (${start.rank}).`
        : `${taken.length} cards, from ${start.rank} through the tail.`,
    fromId: "snake",
    toId: playerId,
    count: taken.length,
    cards: taken,
    faceUp: true,
  });
  return next;
}

function advanceTurn(state: GameState): void {
  const index = state.players.findIndex((p) => p.id === state.currentPlayerId);
  const nextIndex = (index + 1) % state.players.length;
  state.currentPlayerId = state.players[nextIndex].id;
  state.phase = "choose";
  state.lastAsk = null;
  state.turnNumber += 1;
}

function discard(state: GameState, playerId: string, cardId: string): GameState {
  const next = cloneState(state);
  const player = assertCurrent(next, playerId);

  if (next.phase === "fishing") {
    if (player.hand.length !== 1 || player.hand[0].id !== cardId) {
      throw new IllegalMoveError(
        "Once you start asking, keep asking until you miss, or discard your last card to go out.",
      );
    }
  } else if (next.phase !== "fromSnake" && next.phase !== "goFishDiscard") {
    throw new IllegalMoveError("You cannot discard right now.");
  }

  const [card] = takeFromHand(player, [cardId]);
  next.snake.push(card);
  beginEvents(next);
  log(next, `${player.name} discarded ${card.rank} onto the snake.`);
  emit(next, {
    kind: "discard",
    tone: "info",
    title: `${player.name} discarded`,
    detail: `${card.rank} onto the snake`,
    fromId: playerId,
    toId: "snake",
    rank: card.rank,
    count: 1,
    cards: [card],
    faceUp: true,
  });

  if (player.hand.length === 0) {
    endGame(next, player.id);
    return next;
  }

  advanceTurn(next);
  const current = playerById(next, next.currentPlayerId);
  log(next, `${current.name}'s turn.`);
  emit(next, {
    kind: "turn",
    tone: "info",
    title: `${current.name}'s turn`,
    fromId: current.id,
    faceUp: false,
  });
  return next;
}

export function applyAction(state: GameState, playerId: string, action: ClientAction): GameState {
  switch (action.type) {
    case "ask":
      return ask(state, playerId, action.targetId, action.rank);
    case "takeSnake":
      return takeSnake(state, playerId, action.fromIndex);
    case "playMeld":
      return playMeld(state, playerId, action.cardIds);
    case "addToMeld":
      return addToMeld(state, playerId, action.meldIndex, action.cardIds);
    case "discard":
      return discard(state, playerId, action.cardId);
    default:
      throw new IllegalMoveError("Unknown action.");
  }
}

export function toPublicState(state: GameState, youId: string) {
  const you = playerById(state, youId);
  return {
    youId,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      handCount: player.hand.length,
    })),
    yourHand: you.hand,
    stockCount: state.stock.length,
    snake: state.snake,
    melds: state.melds,
    currentPlayerId: state.currentPlayerId,
    phase: state.phase,
    lastAsk: state.lastAsk,
    winnerId: state.winnerId,
    scores: state.scores,
    log: state.log,
    turnNumber: state.turnNumber,
    eventSeq: state.eventSeq,
    events: state.events.map((event) => redactEvent(event, youId)),
  };
}

function redactEvent(event: VisualEvent, youId: string): VisualEvent {
  const involved = event.fromId === youId || event.toId === youId;
  if (event.kind === "give" && !involved) {
    return { ...event, cards: undefined, faceUp: false };
  }
  if (event.faceUp || involved) return event;
  return { ...event, cards: undefined };
}
