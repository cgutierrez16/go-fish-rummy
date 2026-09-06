import { useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  RANKS,
  type ClientAction,
  type PublicGameState,
  type Rank,
  type RoomInfo,
  type VisualEvent,
} from "@gfr/shared";
import { CardView } from "./CardView";
import { FlightLayer } from "./FlightLayer";
import { opponentSeats } from "./seating";
import { connect } from "./socket";
import { Banner, Hand, Seat } from "./tableBits";

const SESSION_KEY = "gfr-session";

interface Session {
  name: string;
  playerId?: string;
  code?: string;
}

function loadSession(): Session {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "") as Session;
  } catch {
    return { name: "" };
  }
}

function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function phaseHint(state: PublicGameState, youId: string): string {
  const yours = state.currentPlayerId === youId;
  if (state.phase === "over") return "Hand over. Scores are in.";
  if (!yours) return "Waiting for the current player.";
  if (state.phase === "choose") {
    if (state.yourHand.length === 0) {
      return "Empty hand: take from the snake, or ask only for an open meld.";
    }
    return "Meld if you want, then ask someone (click a seat) or take from the snake.";
  }
  if (state.phase === "fishing") {
    return "Keep asking, lay down sets, or discard your last card to go out.";
  }
  if (state.phase === "fromSnake") {
    return "You took the snake. Meld if you can, then discard. You cannot ask this turn.";
  }
  return "Go fish missed. Discard a card to end your turn.";
}

function headline(events: VisualEvent[]): VisualEvent | null {
  const order = [
    "goOut",
    "give",
    "fishHit",
    "fishMiss",
    "takeSnake",
    "meld",
    "add",
    "discard",
    "goFish",
    "ask",
    "turn",
    "deal",
  ];
  for (const kind of order) {
    const found = [...events].reverse().find((event) => event.kind === kind);
    if (found) return found;
  }
  return events.at(-1) ?? null;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [session, setSession] = useState<Session>(() => loadSession());
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [state, setState] = useState<PublicGameState | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(session.name);
  const [joinCode, setJoinCode] = useState(session.code ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [askRank, setAskRank] = useState<Rank | null>(null);
  const [askTarget, setAskTarget] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const next = connect();
    setSocket(next);
    next.on("room", (info: RoomInfo) => setRoom(info));
    next.on("state", (publicState: PublicGameState) => {
      setState(publicState);
      setSelected([]);
    });
    next.on("connect", () => {
      const saved = loadSession();
      if (saved.playerId && saved.code) {
        next.emit("joinRoom", { name: saved.name, code: saved.code, playerId: saved.playerId });
      }
    });
    return () => {
      next.removeAllListeners();
      next.close();
    };
  }, []);

  function send<T>(event: string, payload?: T) {
    if (!socket) return;
    setError("");
    socket.emit(event, payload, (response: { ok: boolean; error?: string; playerId?: string; room?: RoomInfo }) => {
      if (!response) return;
      if (!response.ok) {
        setError(response.error ?? "That failed.");
        return;
      }
      if (response.playerId) {
        const nextSession = {
          name: name.trim() || "Player",
          playerId: response.playerId,
          code: response.room?.code,
        };
        setSession(nextSession);
        saveSession(nextSession);
      }
      if (response.room) setRoom(response.room);
    });
  }

  function act(action: ClientAction) {
    send("action", action);
  }

  const youId = session.playerId;
  const isHost = room?.hostId === youId;
  const yourTurn = Boolean(state && youId && state.currentPlayerId === youId);
  const canAct = yourTurn && state?.phase !== "over";

  const openRanks = useMemo(
    () => new Set(state?.melds.filter((meld) => meld.cards.length === 3).map((meld) => meld.rank) ?? []),
    [state],
  );

  const askableRanks = useMemo(() => {
    if (!state || !youId) return [];
    if (state.yourHand.length === 0) return RANKS.filter((rank) => openRanks.has(rank));
    return [...RANKS];
  }, [openRanks, state, youId]);

  function toggleCard(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function tryMeld() {
    if (!state) return;
    const cards = state.yourHand.filter((card) => selected.includes(card.id));
    if (cards.length < 3) {
      setError("Select at least three of the same rank.");
      return;
    }
    const existing = state.melds.findIndex((meld) => meld.rank === cards[0].rank);
    if (existing >= 0) {
      act({ type: "addToMeld", meldIndex: existing, cardIds: selected });
    } else {
      act({ type: "playMeld", cardIds: selected });
    }
  }

  if (!room) {
    return (
      <main className="shell landing">
        <header>
          <p className="eyebrow">Online card game</p>
          <h1>Go Fish Rummy</h1>
          <p className="lede">
            Sets only, a discard snake, and go-fish asks. Play with friends on any network.
          </p>
        </header>
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            send("createRoom", { name });
          }}
        >
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required />
          </label>
          <button type="submit" className="primary">
            Create room
          </button>
          <div className="split">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room code"
              maxLength={5}
            />
            <button type="button" onClick={() => send("joinRoom", { name, code: joinCode })}>
              Join
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  if (!state || !youId) {
    return (
      <main className="shell">
        <header className="room-head">
          <div>
            <p className="eyebrow">Room</p>
            <h1>{room.code}</h1>
          </div>
          <p>Share this code. Friends can join from another Wi-Fi as long as this server is reachable.</p>
        </header>
        <section className="panel">
          <h2>Players</h2>
          <ul className="players">
            {room.players.map((player) => (
              <li key={player.id}>
                {player.name}
                {player.id === room.hostId ? " · host" : ""}
                {!player.connected ? " (offline)" : ""}
              </li>
            ))}
          </ul>
          {isHost ? (
            <button className="primary" onClick={() => send("startGame")} type="button">
              Start game
            </button>
          ) : (
            <p>Waiting for the host to start.</p>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  const you = state.players.find((player) => player.id === youId);
  if (!you) return null;

  const seats = opponentSeats(state.players, youId);
  const currentName =
    state.players.find((player) => player.id === state.currentPlayerId)?.name ?? "Someone";
  const notice = headline(state.events);
  const canAsk = canAct && (state.phase === "choose" || state.phase === "fishing");
  const playerCount = state.players.length;

  return (
    <main className="table">
      <header className="chrome">
        <strong className="room-label">ROOM {room.code}</strong>
        <div className="chrome-right">
          <span className="turn-line">
            {state.phase === "over" ? (
              "Hand over"
            ) : (
              <>
                <em>{currentName}'s turn</em>
                <span> · Stock {state.stockCount}</span>
              </>
            )}
          </span>
          {state.phase === "over" && isHost && (
            <button type="button" className="ghost" onClick={() => send("startGame")}>
              Deal again
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="Play-by-play"
            onClick={() => setShowLog((open) => !open)}
          >
            <LogIcon />
          </button>
        </div>
      </header>

      {showLog && (
        <aside className="log-drawer">
          <h2>Play-by-play</h2>
          <ul>
            {[...state.log].slice(-12).reverse().map((entry, index) => (
              <li key={`${entry.text}-${index}`}>{entry.text}</li>
            ))}
          </ul>
        </aside>
      )}

      <div className={`playfield p${playerCount}`}>
        {seats.north && (
          <Seat
            player={seats.north}
            slot="north"
            active={state.currentPlayerId === seats.north.id}
            picked={askTarget === seats.north.id}
            onPick={() => setAskTarget(seats.north!.id)}
          />
        )}
        {seats.west && (
          <Seat
            player={seats.west}
            slot="west"
            active={state.currentPlayerId === seats.west.id}
            picked={askTarget === seats.west.id}
            onPick={() => setAskTarget(seats.west!.id)}
          />
        )}

        <section className="felt-center">
          <Banner event={notice} />
          <div className="center-piles">
            <div className="stock-pile" data-anchor="stock">
              <div className="card md back">
                <span className="back-frame" />
                <span className="back-mark">GFR</span>
              </div>
              <span className="pile-label">Stock</span>
            </div>
            <div className="snake-wrap" data-anchor="snake">
              <span className="pile-label">Snake</span>
              <div className="snake">
                {state.snake.length === 0 && <p className="muted">Empty</p>}
                {state.snake.map((card, index) => (
                  <div key={card.id} className="snake-slot">
                    <CardView
                      card={card}
                      size="md"
                      onClick={
                        canAct && state.phase === "choose"
                          ? () => act({ type: "takeSnake", fromIndex: index })
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="melds" data-anchor="melds">
            {state.melds.map((meld, index) => (
              <button
                key={meld.rank}
                type="button"
                className="meld"
                disabled={!canAct || selected.length === 0}
                onClick={() => act({ type: "addToMeld", meldIndex: index, cardIds: selected })}
              >
                <span className="meld-label">{meld.rank}s</span>
                <div className="meld-row">
                  {meld.cards.map((played) => (
                    <CardView key={played.card.id} card={played.card} size="sm" />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>

        {seats.east && (
          <Seat
            player={seats.east}
            slot="east"
            active={state.currentPlayerId === seats.east.id}
            picked={askTarget === seats.east.id}
            onPick={() => setAskTarget(seats.east!.id)}
          />
        )}

        <section className="south-dock">
          {state.phase === "over" && state.scores && (
            <ul className="scores">
              {state.players.map((player) => (
                <li key={player.id}>
                  {player.name}: {state.scores?.[player.id]}
                  {state.winnerId === player.id ? " · went out" : ""}
                </li>
              ))}
            </ul>
          )}
          <Seat player={you} slot="south" you active={state.currentPlayerId === you.id}>
            <Hand cards={state.yourHand} selected={selected} onToggle={toggleCard} />
          </Seat>
          <div className="actions">
            <button type="button" className="table-btn" disabled={!canAct || selected.length < 1} onClick={tryMeld}>
              Lay down
            </button>
            <button
              type="button"
              className="table-btn"
              disabled={
                !canAct ||
                selected.length !== 1 ||
                !["fromSnake", "goFishDiscard", "fishing"].includes(state.phase)
              }
              onClick={() => act({ type: "discard", cardId: selected[0] })}
            >
              Discard
            </button>
          </div>
          {canAsk && (
            <div className="ask">
              <p>
                {askTarget
                  ? `Ask ${state.players.find((player) => player.id === askTarget)?.name}`
                  : "Click a player, then a rank"}
              </p>
              <div className="ranks">
                {askableRanks.map((rank) => (
                  <button
                    key={rank}
                    type="button"
                    className={askRank === rank ? "picked" : ""}
                    onClick={() => setAskRank(rank)}
                  >
                    {rank}
                  </button>
                ))}
              </div>
              <button
                className="table-btn ask-go"
                type="button"
                disabled={!askTarget || !askRank}
                onClick={() => {
                  if (!askTarget || !askRank) return;
                  act({ type: "ask", targetId: askTarget, rank: askRank });
                }}
              >
                Ask
              </button>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      </div>

      <button type="button" className="help-btn" aria-label="Help" onClick={() => setShowHelp((open) => !open)}>
        ?
      </button>
      {showHelp && (
        <div className="help-card">
          <p>{phaseHint(state, youId)}</p>
          <p>Click an opponent to ask. Click a snake card to take it through the tail.</p>
        </div>
      )}
      <FlightLayer events={state.events} eventSeq={state.eventSeq} />
    </main>
  );
}

function LogIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
