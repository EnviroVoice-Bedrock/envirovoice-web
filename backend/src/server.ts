import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { roomsRouter } from "./routes/rooms.js";
import { attachWebSocketServer } from "./signaling/wsServer.js";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin
  })
);
app.use(express.json({ limit: "16kb" }));

app.use("/api", healthRouter);
app.use("/api", roomsRouter);

const server = createServer(app);
attachWebSocketServer(server);

server.listen(env.port, () => {
  console.info(`[Server] Started on http://localhost:${env.port}`);
  console.info(`[WebSocket] Listening on ws://localhost:${env.port}`);
});
