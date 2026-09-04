import { useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  RANKS,
  type ClientAction,
  type PublicGameState,
  type Rank,
  type RoomInfo,
} from "@gfr/shared";
import { CardView } from "./CardView";
import { connect } from "./socket";

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
      return "Empty hand: take from the snake, or ask only for an open meld (three of a rank on the table).";
    }
    return "Meld if you want, then ask someone for a rank, or take cards from the snake.";
  }
  if (state.phase === "fishing") {
    return "Keep asking, lay down sets, or discard your last card to go out.";
  }
  if (state.phase === "fromSnake") {
    return "You took the snake. Meld if you can, then discard. You cannot ask this turn.";
  }
  return "Go fish missed. Discard a card to end your turn.";
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
            <button
              type="button"
              onClick={() => send("joinRoom", { name, code: joinCode })}
            >
              Join
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  if (!state) {
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

  const currentName =
    state.players.find((player) => player.id === state.currentPlayerId)?.name ?? "Someone";

  return (
    <main className="table">
      <header className="table-bar">
        <strong>Room {room.code}</strong>
        <span>
          {state.phase === "over" ? "Hand over" : `${currentName}'s turn`} · Stock {state.stockCount}
        </span>
        {state.phase === "over" && isHost && (
          <button type="button" onClick={() => send("startGame")}>
            Deal again
          </button>
        )}
      </header>

      <section className="opponents">
        {state.players
          .filter((player) => player.id !== youId)
          .map((player) => (
            <button
              key={player.id}
              type="button"
              className={`seat ${askTarget === player.id ? "picked" : ""} ${state.currentPlayerId === player.id ? "active" : ""}`}
              onClick={() => setAskTarget(player.id)}
            >
              <strong>{player.name}</strong>
              <span>{player.handCount} cards</span>
              {!player.connected && <em>offline</em>}
            </button>
          ))}
      </section>

      <section className="felt">
        <div>
          <h2>Melds</h2>
          <div className="melds">
            {state.melds.length === 0 && <p className="muted">No sets on the table yet.</p>}
            {state.melds.map((meld, index) => (
              <div key={meld.rank} className="meld">
                <span>
                  {meld.rank}s {meld.cards.length === 3 ? "· open" : "· complete"}
                </span>
                <div className="row">
                  {meld.cards.map((played) => (
                    <CardView key={played.card.id} card={played.card} />
                  ))}
                </div>
                {canAct && selected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => act({ type: "addToMeld", meldIndex: index, cardIds: selected })}
                  >
                    Add selected
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2>Snake</h2>
          <p className="muted">Head is oldest. Click a card to take it and everything through the tail.</p>
          <div className="snake">
            {state.snake.length === 0 && <p className="muted">Empty — the next discard starts a new head.</p>}
            {state.snake.map((card, index) => (
              <div key={card.id} className="snake-slot">
                {index === 0 && <span>head</span>}
                {index === state.snake.length - 1 && <span>tail</span>}
                <CardView
                  card={card}
                  stacked
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
      </section>

      <section className="hand-dock">
        <p className="hint">{phaseHint(state, youId ?? "")}</p>
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
        <div className="row hand">
          {state.yourHand.map((card) => (
            <CardView
              key={card.id}
              card={card}
              selected={selected.includes(card.id)}
              onClick={() => toggleCard(card.id)}
            />
          ))}
          {state.yourHand.length === 0 && <p className="muted">Your hand is empty. You are still in until you go out on a discard.</p>}
        </div>
        <div className="actions">
          <button type="button" disabled={!canAct || selected.length < 1} onClick={tryMeld}>
            Lay down / add
          </button>
          <button
            type="button"
            disabled={!canAct || selected.length !== 1 || !["fromSnake", "goFishDiscard", "fishing"].includes(state.phase)}
            onClick={() => act({ type: "discard", cardId: selected[0] })}
          >
            Discard selected
          </button>
        </div>
        {(state.phase === "choose" || state.phase === "fishing") && canAct && (
          <div className="ask">
            <p>Ask for a rank {askTarget ? `from ${state.players.find((p) => p.id === askTarget)?.name}` : "(pick a player above)"}</p>
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
              className="primary"
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
        <ul className="log">
          {[...state.log].slice(-8).reverse().map((entry, index) => (
            <li key={`${entry.text}-${index}`}>{entry.text}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
