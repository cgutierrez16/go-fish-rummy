import type { ReactNode } from "react";
import type { Card, PublicPlayer, VisualEvent } from "@gfr/shared";
import { CardFan, CardView, SUIT_MARK } from "./CardView";

export function Seat({
  player,
  slot,
  you,
  active,
  picked,
  onPick,
  children,
}: {
  player: PublicPlayer;
  slot: "north" | "west" | "east" | "south";
  you?: boolean;
  active: boolean;
  picked?: boolean;
  onPick?: () => void;
  children?: ReactNode;
}) {
  const className = `seat ${slot} ${active ? "active" : ""} ${picked ? "picked" : ""} ${you ? "you" : ""}`;
  const pill = (
    <span className={`name-pill ${active ? "on-turn" : ""}`}>
      {active && <span className="turn-dot" />}
      {you ? `${player.name} · ${player.handCount} cards` : `${player.name} ${player.handCount}`}
      {!player.connected ? " · offline" : ""}
    </span>
  );

  const body =
    slot === "south" ? (
      <>
        {pill}
        {children}
      </>
    ) : (
      <>
        <CardFan count={player.handCount} slot={slot} />
        {pill}
      </>
    );

  if (onPick) {
    return (
      <button
        type="button"
        className={className}
        data-anchor={`player:${player.id}`}
        onClick={onPick}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={className} data-anchor={`player:${player.id}`}>
      {body}
    </div>
  );
}

export function Banner({ event }: { event: VisualEvent | null }) {
  if (!event) return null;
  return (
    <div className={`banner ${event.tone}`} role="status">
      {formatEventLine(event)}
    </div>
  );
}

export function formatEventLine(event: VisualEvent): string {
  const card = event.cards?.[0];
  const face = card ? `${card.rank}${SUIT_MARK[card.suit]}` : event.rank;
  if (event.kind === "discard" && face) {
    const name = event.title.replace(/ discarded$/i, "");
    return `${name} discarded ${face} → snake`;
  }
  if (event.kind === "give") {
    return `${event.title} · ${event.detail ?? ""}`.trim();
  }
  if (event.kind === "fishHit") return event.title;
  if (event.kind === "goFish") return `${event.title}${event.detail ? ` · ${event.detail}` : ""}`;
  if (event.detail) return `${event.title} · ${event.detail}`;
  return event.title;
}

export function Hand({
  cards,
  selected,
  onToggle,
}: {
  cards: Card[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (cards.length === 0) {
    return <p className="empty-hand">Empty hand — still in until you go out on a discard.</p>;
  }
  const mid = (cards.length - 1) / 2;
  return (
    <div className="hand-fan">
      {cards.map((card, index) => (
        <div
          key={card.id}
          className="hand-slot"
          style={{ ["--i" as string]: index, ["--mid" as string]: mid, ["--n" as string]: cards.length }}
        >
          <CardView
            card={card}
            size="lg"
            selected={selected.includes(card.id)}
            onClick={() => onToggle(card.id)}
          />
        </div>
      ))}
    </div>
  );
}
