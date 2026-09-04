import type { ReactNode } from "react";
import type { Card, PublicPlayer, VisualEvent } from "@gfr/shared";
import { CardFan, CardView } from "./CardView";

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
  const body = (
    <>
      <div className="seat-meta">
        <strong>{you ? `${player.name} · you` : player.name}</strong>
        <span>{player.handCount} cards</span>
        {!player.connected && <em>offline</em>}
      </div>
      {!you && <CardFan count={player.handCount} vertical={slot === "west" || slot === "east"} />}
      {children}
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
    <div className={`banner ${event.tone} ${event.kind}`} role="status">
      <strong>{event.title}</strong>
      {event.detail && <span>{event.detail}</span>}
    </div>
  );
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
    return <p className="empty-hand">Your hand is empty. You are still in until you go out on a discard.</p>;
  }
  return (
    <div className="hand-fan">
      {cards.map((card, index) => (
        <div
          key={card.id}
          className="hand-slot"
          style={{ ["--i" as string]: index, ["--n" as string]: cards.length }}
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
