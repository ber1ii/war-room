import { io, Socket } from "socket.io-client";

export const getSocketUrl = () => {
  if (process.env.NODE_ENV === "production") {
    return process.env.NEXT_PUBLIC_SOCKET_URL || "https://YOUR-BACKEND-URL.koyeb.app";
  }
  return "http://localhost:4000";
};

export const socketConfig = {
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  autoConnect: true,
  transports: ["websocket"],
};
