import {
  applyAction,
  IllegalMoveError,
  startGame,
  toPublicState,
  type ClientAction,
  type GameState,
  type RoomInfo,
} from "@gfr/shared";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);

interface RoomPlayer {
  id: string;
  name: string;
  socketId: string | null;
}

interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  game: GameState | null;
}

const rooms = new Map<string, Room>();
const socketToSeat = new Map<string, { code: string; playerId: string }>();

function roomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  if (rooms.has(code)) return roomCode();
  return code;
}

function toRoomInfo(room: Room): RoomInfo {
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.socketId !== null,
    })),
    started: room.game !== null,
    minPlayers: 2,
    maxPlayers: 4,
  };
}

function emitRoom(io: Server, room: Room): void {
  io.to(room.code).emit("room", toRoomInfo(room));
  if (!room.game) return;
  for (const player of room.players) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit("state", toPublicState(room.game, player.id));
  }
}

function getRoomForSocket(socketId: string): { room: Room; playerId: string } | null {
  const seat = socketToSeat.get(socketId);
  if (!seat) return null;
  const room = rooms.get(seat.code);
  if (!room) return null;
  return { room, playerId: seat.playerId };
}

const app = express();
app.use(cors());
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const clientDist = join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get(/.*/, (_req, res, next) => {
  res.sendFile(join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

io.on("connection", (socket) => {
  socket.on(
    "createRoom",
    ({ name }: { name: string }, ack?: (payload: unknown) => void) => {
      const trimmed = (name ?? "").trim().slice(0, 24) || "Player";
      const playerId = randomUUID();
      const code = roomCode();
      const room: Room = {
        code,
        hostId: playerId,
        players: [{ id: playerId, name: trimmed, socketId: socket.id }],
        game: null,
      };
      rooms.set(code, room);
      socketToSeat.set(socket.id, { code, playerId });
      socket.join(code);
      ack?.({ ok: true, playerId, room: toRoomInfo(room) });
      emitRoom(io, room);
    },
  );

  socket.on(
    "joinRoom",
    (
      { name, code, playerId }: { name: string; code: string; playerId?: string },
      ack?: (payload: unknown) => void,
    ) => {
      const room = rooms.get((code ?? "").trim().toUpperCase());
      if (!room) {
        ack?.({ ok: false, error: "No room with that code." });
        return;
      }

      if (playerId) {
        const existing = room.players.find((p) => p.id === playerId);
        if (existing) {
          existing.socketId = socket.id;
          if (room.game) {
            const gamePlayer = room.game.players.find((p) => p.id === playerId);
            if (gamePlayer) gamePlayer.connected = true;
          }
          socketToSeat.set(socket.id, { code: room.code, playerId });
          socket.join(room.code);
          ack?.({ ok: true, playerId, room: toRoomInfo(room) });
          emitRoom(io, room);
          return;
        }
      }

      if (room.game) {
        ack?.({ ok: false, error: "That game already started." });
        return;
      }
      if (room.players.length >= 4) {
        ack?.({ ok: false, error: "That room is full." });
        return;
      }

      const trimmed = (name ?? "").trim().slice(0, 24) || "Player";
      const id = randomUUID();
      room.players.push({ id, name: trimmed, socketId: socket.id });
      socketToSeat.set(socket.id, { code: room.code, playerId: id });
      socket.join(room.code);
      ack?.({ ok: true, playerId: id, room: toRoomInfo(room) });
      emitRoom(io, room);
    },
  );

  socket.on("startGame", (ack?: (payload: unknown) => void) => {
    const seated = getRoomForSocket(socket.id);
    if (!seated) {
      ack?.({ ok: false, error: "You are not in a room." });
      return;
    }
    const { room, playerId } = seated;
    if (room.hostId !== playerId) {
      ack?.({ ok: false, error: "Only the host can start." });
      return;
    }
    if (room.players.length < 2) {
      ack?.({ ok: false, error: "Need at least two players." });
      return;
    }
    if (room.game && room.game.phase !== "over") {
      ack?.({ ok: false, error: "The game is already underway." });
      return;
    }
    room.game = startGame(room.players.map((p) => ({ id: p.id, name: p.name })));
    ack?.({ ok: true });
    emitRoom(io, room);
  });

  socket.on("action", (action: ClientAction, ack?: (payload: unknown) => void) => {
    const seated = getRoomForSocket(socket.id);
    if (!seated?.room.game) {
      ack?.({ ok: false, error: "No active game." });
      return;
    }
    try {
      seated.room.game = applyAction(seated.room.game, seated.playerId, action);
      ack?.({ ok: true });
      emitRoom(io, seated.room);
    } catch (error) {
      const message =
        error instanceof IllegalMoveError ? error.message : "That move failed.";
      ack?.({ ok: false, error: message });
    }
  });

  socket.on("disconnect", () => {
    const seated = getRoomForSocket(socket.id);
    socketToSeat.delete(socket.id);
    if (!seated) return;
    const player = seated.room.players.find((p) => p.id === seated.playerId);
    if (player && player.socketId === socket.id) player.socketId = null;
    if (seated.room.game) {
      const gamePlayer = seated.room.game.players.find((p) => p.id === seated.playerId);
      if (gamePlayer) gamePlayer.connected = false;
    }
    emitRoom(io, seated.room);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Go Fish Rummy server on http://localhost:${PORT}`);
});
