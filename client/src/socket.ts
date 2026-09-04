import { io, type Socket } from "socket.io-client";

const serverUrl =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : window.location.origin);

export function connect(): Socket {
  return io(serverUrl, { transports: ["websocket", "polling"] });
}
