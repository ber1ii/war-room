import { PrismaClient } from "@prisma/client";
import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { TEST_VAR } from "@war-room/shared";
import { error } from "console";

const prisma = new PrismaClient();

const app = express();
const port = 4000;

app.use(cors({ origin: "*" }));
app.use(express.json());

interface Operative {
  id: string;
  username: string;
  status: "OPERATIONAL" | "INPUTTING_COMMAND" | "DORMANT";
  lastActive: number;
  location: string;
}

const activeOperatives = new Map<string, Operative>();

const broadcastRadar = () => {
  const operativesList = Array.from(activeOperatives.values());
  io.emit("radar_update", operativesList);
};

setInterval(() => {
  const now = Date.now();
  let changed = false;

  activeOperatives.forEach((op, socketId) => {
    if (now - op.lastActive > 60000 && op.status !== "DORMANT") {
      op.status = "DORMANT";
      changed = true;
    }

    if (op.status === "INPUTTING_COMMAND" && now - op.lastActive > 3000) {
      op.status = "OPERATIONAL";
      changed = true;
    }
  });

  if (changed) broadcastRadar();
}, 5000);

app.post("/incidents", async (req, res) => {
  const { title, severity, createdBy } = req.body;

  try {
    const incident = await prisma.incident.create({
      data: {
        title,
        severity,
        createdBy,
        isActive: true,
      },
    });
    res.json(incident);
  } catch (e) {
    res.status(500).json({ error: "Could not create incident" });
  }
});

app.get("/incidents", async (req, res) => {
  try {
    const incidents = await prisma.incident.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    res.json(incidents);
  } catch (error) {
    console.error("Error fetching incidents:", error);
    res.status(500).send("Error fetching incidents");
  }
});

app.get("/", (req, res) => {
  res.send("<h1>Server is running! War Room API is ready at /incidents</h1>");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.get("/incidents/:id/messages", async (req, res) => {
  try {
    const messages = await prisma.incidentEvent.findMany({
      where: {
        incidentId: req.params.id,
        type: "message",
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch messages" });
  }
});

app.get("/incidents/:id/checklist", async (req, res) => {
  const incidentId = req.params.id;

  const incidentExists = await prisma.incident.findUnique({
    where: { id: incidentId },
  });

  if (!incidentExists) {
    return res.status(404).json({ error: "Incident not found" });
  }

  const items = await prisma.checklistItem.findMany({
    where: { incidentId },
    orderBy: { text: "asc" },
  });

  if (items.length === 0) {
    const defaults = ["Assign Lead", "Isolate Service", "Check Logs", "Notify Stakeholders"];
    try {
      const created = await Promise.all(
        defaults.map((text) =>
          prisma.checklistItem.create({
            data: { incidentId: req.params.id, text },
          }),
        ),
      );
      return res.json(created);
    } catch (e) {
      return res.status(500).json({ error: "Failed to seed checklist" });
    }
  }
  res.json(items);
});

app.get("/incidents/:id", async (req, res) => {
  const incident = await prisma.incident.findUnique({
    where: { id: req.params.id },
  });
  res.json(incident);
});

interface SystemVitals {
  cpu: number;
  memory: number;
  latency: number;
  db_iops: number;
  cache_hit: number;
  active_threads: number;
  error_rate: number;
  status: "NOMINAL" | "WARNING" | "CRITICAL";
  alert?: string;
}

// Heartbeat engine
setInterval(() => {
  const chaosRoll = Math.random();
  let mode: "NOMINAL" | "SPIKE_CPU" | "CACHE_DUMP" | "DB_LOCK" = "NOMINAL";

  if (chaosRoll > 0.995) mode = "SPIKE_CPU";
  else if (chaosRoll > 0.99) mode = "CACHE_DUMP";
  else if (chaosRoll > 0.985) mode = "DB_LOCK";

  let vitals: SystemVitals = {
    cpu: 25 + Math.random() * 15,
    memory: 40 + Math.random() * 10,
    latency: 15 + Math.random() * 10,
    db_iops: 400 + Math.floor(Math.random() * 200),
    cache_hit: 95 + Math.random() * 4,
    active_threads: 120 + Math.floor(Math.random() * 30),
    error_rate: Math.random() * 0.5,
    status: "NOMINAL",
  };

  switch (mode) {
    case "SPIKE_CPU":
      vitals.cpu = 85 + Math.random() * 14;
      vitals.active_threads += 400;
      vitals.status = "CRITICAL";
      vitals.alert = "CPU_THROTTLING_DETECTED";
      break;

    case "CACHE_DUMP":
      vitals.cache_hit = Math.random() * 20;
      vitals.latency += 200;
      vitals.db_iops += 2000;
      vitals.status = "WARNING";
      vitals.alert = "REDIS_CONNECTION_UNSTABLE";
      break;

    case "DB_LOCK":
      vitals.db_iops = 0;
      vitals.active_threads += 1000;
      vitals.error_rate = 5 + Math.random() * 10;
      vitals.status = "CRITICAL";
      vitals.alert = "DEADLOCK_DEDECTED_IN_PRIMARY_DB";
      break;
  }

  io.emit("system_vitals", vitals);
}, 2000);

io.on("connection", (socket: Socket) => {
  console.log("User connected: ", socket.id);

  socket.on("identify_operative", (data: { username: string }) => {
    activeOperatives.set(socket.id, {
      id: socket.id,
      username: data.username,
      status: "OPERATIONAL",
      lastActive: Date.now(),
      location: "HQ (Lobby)",
    });
    broadcastRadar();
  });

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);

    const op = activeOperatives.get(socket.id);
    if (op) {
      op.location = `Incident ${roomId.slice(0, 4)}...`;
      op.lastActive = Date.now();
      broadcastRadar();
    }
  });

  socket.on("send_message", async (data) => {
    const { roomId, message } = data;

    try {
      await prisma.incidentEvent.create({
        data: {
          incidentId: roomId,
          userId: message.sender,
          text: message.text,
          type: "message",
        },
      });

      socket.to(roomId).emit("message", message);
    } catch (error) {
      console.error("Error saving message to database:", error);
    }
  });

  socket.on("toggle_checklist", async (data) => {
    const { itemId, isCompleted, roomId } = data;

    await prisma.checklistItem.update({
      where: { id: itemId },
      data: { isCompleted },
    });

    io.to(roomId).emit("checklist_update", { itemId, isCompleted });
  });

  socket.on("add_checklist_item", async (data) => {
    const { roomId, text } = data;

    try {
      const newItem = await prisma.checklistItem.create({
        data: {
          incidentId: roomId,
          text: text,
          isCompleted: false,
        },
      });

      io.to(roomId).emit("new_checklist_item", newItem);
    } catch (e) {
      console.error("Error adding checklist item:", e);
    }
  });

  socket.on("typing", (data) => {
    socket.to(data.roomId).emit("display_typing", data.username);

    const op = activeOperatives.get(socket.id);
    if (op) {
      op.status = "INPUTTING_COMMAND";
      op.lastActive = Date.now();
      broadcastRadar();
    }
  });

  socket.on("stop_typing", (data) => {
    socket.to(data.roomId).emit("hide_typing", data.username);

    const op = activeOperatives.get(socket.id);
    if (op) {
      op.status = "OPERATIONAL";
      op.lastActive = Date.now();
      broadcastRadar();
    }
  });

  socket.on("update_severity", async (data) => {
    const { roomId, severity } = data;

    await prisma.incident.update({
      where: { id: roomId },
      data: { severity },
    });

    io.to(roomId).emit("severity_update", severity);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
