import type { Card as CardType } from "@gfr/shared";

const SUIT_MARK: Record<CardType["suit"], string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export function CardView({
  card,
  selected,
  stacked,
  onClick,
}: {
  card: CardType;
  selected?: boolean;
  stacked?: boolean;
  onClick?: () => void;
}) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <button
      type="button"
      className={`card ${red ? "red" : "black"} ${selected ? "selected" : ""} ${stacked ? "stacked" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="corner top">
        {card.rank}
        <small>{SUIT_MARK[card.suit]}</small>
      </span>
      <span className="pip">{SUIT_MARK[card.suit]}</span>
      <span className="corner bottom">
        {card.rank}
        <small>{SUIT_MARK[card.suit]}</small>
      </span>
    </button>
  );
}
