import type { Card as CardType } from "@gfr/shared";

export const SUIT_MARK: Record<CardType["suit"], string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export type CardSize = "sm" | "md" | "lg";

export function CardView({
  card,
  selected,
  onClick,
  size = "md",
  face = "up",
}: {
  card?: CardType;
  selected?: boolean;
  onClick?: () => void;
  size?: CardSize;
  face?: "up" | "down";
}) {
  const red = card && (card.suit === "hearts" || card.suit === "diamonds");
  const className = `card ${size} ${face === "down" || !card ? "back" : red ? "red" : "black"} ${selected ? "selected" : ""}`;

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <CardFace card={card} face={face} />
      </button>
    );
  }

  return (
    <div className={className}>
      <CardFace card={card} face={face} />
    </div>
  );
}

function CardFace({ card, face }: { card?: CardType; face: "up" | "down" }) {
  if (face === "down" || !card) {
    return (
      <>
        <span className="back-frame" />
        <span className="back-mark">GFR</span>
      </>
    );
  }
  return (
    <>
      <span className="corner top">
        {card.rank}
        <small>{SUIT_MARK[card.suit]}</small>
      </span>
      <span className="pip">{SUIT_MARK[card.suit]}</span>
      <span className="corner bottom">
        {card.rank}
        <small>{SUIT_MARK[card.suit]}</small>
      </span>
    </>
  );
}

export function CardFan({
  count,
  slot,
}: {
  count: number;
  slot: "north" | "west" | "east";
}) {
  const shown = Math.min(Math.max(count, 0), 8);
  const mid = shown <= 1 ? 0 : (shown - 1) / 2;
  return (
    <div className={`card-fan ${slot}`} aria-hidden="true">
      {Array.from({ length: shown }, (_, index) => (
        <div
          key={index}
          className="card sm back fan-card"
          style={{ ["--i" as string]: index, ["--mid" as string]: mid }}
        >
          <span className="back-frame" />
          <span className="back-mark">GFR</span>
        </div>
      ))}
    </div>
  );
}
