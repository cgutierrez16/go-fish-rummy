import { useLayoutEffect, useState, type CSSProperties } from "react";
import type { Card, VisualEvent } from "@gfr/shared";
import { CardView } from "./CardView";

interface Flight {
  key: string;
  delay: number;
  card?: Card;
  face: "up" | "down";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const FLY_KINDS = new Set([
  "give",
  "discard",
  "takeSnake",
  "meld",
  "add",
  "goFish",
  "fishHit",
  "fishMiss",
]);

function anchor(id: string | undefined): string | null {
  if (!id) return null;
  if (id === "snake" || id === "stock" || id === "melds") return id;
  return `player:${id}`;
}

function center(el: Element): { x: number; y: number } {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

export function FlightLayer({ events, eventSeq }: { events: VisualEvent[]; eventSeq: number }) {
  const [flights, setFlights] = useState<Flight[]>([]);

  useLayoutEffect(() => {
    const next: Flight[] = [];
    let stagger = 0;
    for (const event of events) {
      if (!FLY_KINDS.has(event.kind)) continue;
      const fromEl = document.querySelector(`[data-anchor="${anchor(event.fromId)}"]`);
      const toEl = document.querySelector(`[data-anchor="${anchor(event.toId)}"]`);
      if (!fromEl || !toEl) continue;
      const from = center(fromEl);
      const to = center(toEl);
      const n = Math.min(event.count ?? event.cards?.length ?? 1, 6);
      for (let i = 0; i < n; i++) {
        const card = event.cards?.[i];
        next.push({
          key: `${event.id}-${i}`,
          delay: stagger + i * 70,
          card,
          face: event.faceUp && card ? "up" : "down",
          x1: from.x - 36,
          y1: from.y - 50,
          x2: to.x - 36 + i * 14,
          y2: to.y - 50,
        });
      }
      stagger += 90;
    }
    setFlights(next);
    const timeout = window.setTimeout(() => setFlights([]), 850 + stagger);
    return () => window.clearTimeout(timeout);
  }, [eventSeq, events]);

  if (flights.length === 0) return null;

  return (
    <div className="flight-layer" aria-hidden="true">
      {flights.map((flight) => (
        <div
          key={flight.key}
          className="flight"
          style={
            {
              ["--x1" as string]: `${flight.x1}px`,
              ["--y1" as string]: `${flight.y1}px`,
              ["--x2" as string]: `${flight.x2}px`,
              ["--y2" as string]: `${flight.y2}px`,
              ["--delay" as string]: `${flight.delay}ms`,
            } as CSSProperties
          }
        >
          <CardView card={flight.card} face={flight.face} size="md" />
        </div>
      ))}
    </div>
  );
}
