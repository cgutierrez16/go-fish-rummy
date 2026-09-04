export const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface PlayedCard {
  card: Card;
  playerId: string;
}

export interface Meld {
  rank: Rank;
  cards: PlayedCard[];
}

export type Phase =
  | "choose"
  | "fishing"
  | "fromSnake"
  | "goFishDiscard"
  | "over";

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  connected: boolean;
}

export interface GameLogEntry {
  text: string;
}

export type VisualKind =
  | "deal"
  | "ask"
  | "give"
  | "goFish"
  | "fishHit"
  | "fishMiss"
  | "discard"
  | "takeSnake"
  | "meld"
  | "add"
  | "turn"
  | "goOut";

export type VisualTone = "info" | "success" | "miss" | "alert";

export interface VisualEvent {
  id: string;
  kind: VisualKind;
  tone: VisualTone;
  title: string;
  detail?: string;
  fromId?: string;
  toId?: string;
  rank?: Rank;
  count?: number;
  cards?: Card[];
  faceUp: boolean;
}

export interface GameState {
  players: Player[];
  stock: Card[];
  snake: Card[];
  melds: Meld[];
  currentPlayerId: string;
  phase: Phase;
  lastAsk: { targetId: string; rank: Rank } | null;
  winnerId: string | null;
  scores: Record<string, number> | null;
  log: GameLogEntry[];
  turnNumber: number;
  eventSeq: number;
  events: VisualEvent[];
}

export type PublicPlayer = Omit<Player, "hand"> & { handCount: number };

export interface PublicGameState {
  youId: string;
  players: PublicPlayer[];
  yourHand: Card[];
  stockCount: number;
  snake: Card[];
  melds: Meld[];
  currentPlayerId: string;
  phase: Phase;
  lastAsk: { targetId: string; rank: Rank } | null;
  winnerId: string | null;
  scores: Record<string, number> | null;
  log: GameLogEntry[];
  turnNumber: number;
  eventSeq: number;
  events: VisualEvent[];
}

export type ClientAction =
  | { type: "ask"; targetId: string; rank: Rank }
  | { type: "takeSnake"; fromIndex: number }
  | { type: "playMeld"; cardIds: string[] }
  | { type: "addToMeld"; meldIndex: number; cardIds: string[] }
  | { type: "discard"; cardId: string };

export interface RoomInfo {
  code: string;
  hostId: string;
  players: { id: string; name: string; connected: boolean }[];
  started: boolean;
  minPlayers: number;
  maxPlayers: number;
}
