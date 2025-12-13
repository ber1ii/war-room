import { PrismaClient } from "@prisma/client";
import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { TEST_VAR } from "@war-room/shared";

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
  const { title, severity } = req.body;

  try {
    const incident = await prisma.incident.create({
      data: {
        title,
        severity,
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
  const items = await prisma.checklistItem.findMany({
    where: { incidentId: req.params.id },
    orderBy: { text: "asc" },
  });

  if (items.length === 0) {
    const defaults = ["Assign Lead", "Isolate Service", "Check Logs", "Notify Stakeholders"];
    const created = await Promise.all(
      defaults.map((text) =>
        prisma.checklistItem.create({
          data: { incidentId: req.params.id, text },
        }),
      ),
    );
    return res.json(created);
  }
  res.json(items);
});

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

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
