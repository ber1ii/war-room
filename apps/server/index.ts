import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { expressjwt, GetVerificationKey } from "express-jwt";
import JwksRsa from "jwks-rsa";
import { Octokit } from "octokit";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const PORT = process.env.PORT || 4000;
const rawClientUrl = process.env.CLIENT_URL || "http://localhost:3000";
const CLIENT_URLS = rawClientUrl.split(",").map((url) => url.trim());
const SUPABASE_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_URL = `https://${SUPABASE_REF}.supabase.co`;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!SUPABASE_REF) {
  console.error("FATAL: SUPABASE_PROJECT_REF is missing.");
  process.exit(1);
}

const jwksClient = JwksRsa({
  jwksUri: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
});

const verifySocketToken = (token: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    // 1. Decode to find the Key ID (kid) in header
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header.kid) {
      return reject(new Error("Invalid Token Structure"));
    }

    // 2. Get the Signing Key from Supabase JWKS
    jwksClient.getSigningKey(decoded.header.kid, (err, key) => {
      if (err || !key) return reject(err || new Error("Key not found"));

      const signingKey = key.getPublicKey();

      // 3. Verify the token using the key and ES256 algorithm
      jwt.verify(token, signingKey, { algorithms: ["ES256"] }, (err, verified) => {
        if (err) return reject(err);
        resolve(verified);
      });
    });
  });
};

declare global {
  namespace Express {
    interface Request {
      auth?: {
        sub: string;
        [key: string]: any;
      };
    }
  }
}

const prisma = new PrismaClient();
const app = express();
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const GITHUB_OWNER = process.env.GITHUB_OWNER!;
const GITHUB_REPO = process.env.GITHUB_REPO!;

app.use(
  cors({
    origin: CLIENT_URLS,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

const authenticate = expressjwt({
  secret: JwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  }) as GetVerificationKey,
  audience: "authenticated",
  issuer: `${SUPABASE_URL}/auth/v1`,
  algorithms: ["ES256"],
});

const encrypt = (text: string) => {
  if (!ENCRYPTION_KEY) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

const decrypt = (text: string) => {
  if (!ENCRYPTION_KEY) return text;
  const parts = text.split(":");
  if (parts.length < 2) return text;
  const iv = Buffer.from(parts.shift()!, "hex");
  const encryptedText = Buffer.from(parts.join(":"), "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

const api = express.Router();

api.get("/health", (req, res) => res.send("Systems Operational!"));

api.use(authenticate);

api.post("/integrations/github/push", async (req, res) => {
  const { filename, content, commitMessage } = req.body;
  const user = req.auth;
  const username = user?.user_metadata?.username || "Unknown Agent";

  if (!filename || !content) {
    return res.status(400).json({ error: "Filename and content required" });
  }

  try {
    let sha: string | undefined;
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: filename,
      });
      if (!Array.isArray(data) && "sha" in data) sha = data.sha;
    } catch (err: any) {
      if (err.status !== 404) throw err;
    }

    const response = await octokit.rest.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: filename,
      message: commitMessage || `Update ${filename} by ${username}`,
      content: Buffer.from(content).toString("base64"),
      sha,
      committer: { name: "War Room System", email: "system@warroom.io" },
      author: { name: username, email: user?.email || "agent@warroom.io" },
    });
    res.json({ success: true, url: response.data.content?.html_url });
  } catch (error: any) {
    console.error("Github Push Error:", error);
    res.status(500).json({ error: "Failed to push to Github" });
  }
});

api.post("/incidents", async (req, res) => {
  const username = req.auth?.user_metadata?.username || "Unknown Agent";
  try {
    const incident = await prisma.incident.create({
      data: { ...req.body, createdBy: username, status: "OPEN" },
    });
    res.json(incident);
  } catch (e) {
    res.status(500).json({ error: "Creation failed" });
  }
});

api.get("/incidents", async (req, res) => {
  const incidents = await prisma.incident.findMany({
    where: { status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
  });
  res.json(incidents);
});

api.get("/incidents/:id/messages", async (req, res) => {
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

api.get("/incidents/:id/checklist", async (req, res) => {
  const incidentId = req.params.id;

  try {
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

    res.json(items);
  } catch (error) {
    console.error("Failed to fetch checklist", error);
    res.status(500).json({ error: "Failed to fetch checklist" });
  }
});

api.get("/incidents/:id", async (req, res) => {
  const incident = await prisma.incident.findUnique({ where: { id: req.params.id } });
  res.json(incident);
});

api.get("/incidents/:id/snippets", async (req, res) => {
  const snippets = await prisma.snippet.findMany({
    where: { incidentId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(snippets);
});

api.post("/snippets", async (req, res) => {
  const { incidentId, title, language, code } = req.body;
  const snippet = await prisma.snippet.create({
    data: { incidentId, title, language, code: code || "// New Snippet" },
  });
  res.json(snippet);
});

api.patch("/snippets/:id", async (req, res) => {
  const { id } = req.params;
  const { code } = req.body;

  try {
    const updated = await prisma.snippet.update({
      where: { id },
      data: { code },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update snippet" });
  }
});

api.delete("/snippets/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const snippet = await prisma.snippet.findUnique({ where: { id } });
    if (!snippet) return res.status(404).json({ error: "Snippet not found" });

    await prisma.snippet.delete({ where: { id } });

    res.json({ success: true, incidentId: snippet.incidentId });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete snippet" });
  }
});

api.patch("/incidents/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const user = req.auth;
  const username = user?.user_metadata?.username || "Unknown Agent";

  try {
    const incident = await prisma.incident.update({
      where: { id },
      data: { status: "RESOLVED" },
    });

    await logSystemEvent(id, `*** INCIDENT MARKED RESOLVED BY ${username.toUpperCase()} ***`);

    io.to(id).emit("incident_resolved");

    res.json(incident);
  } catch (e) {
    res.status(500).json({ error: "Failed to resolve incident" });
  }
});

api.delete("/incidents/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.incident.delete({ where: { id } });

    io.to(id).emit("incident_deleted");

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete incident" });
  }
});

api.post("/secrets", async (req, res) => {
  const { incidentId, label, value } = req.body;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  try {
    const encryptedValue = encrypt(value); // Encrypt!
    const secret = await prisma.secret.create({
      data: { incidentId, label, value: encryptedValue, expiresAt, viewedBy: [] },
    });

    await logSystemEvent(incidentId, `SECURE VAULT: NEW ASSET "${label.toUpperCase()}" DEPOSITED`);
    io.to(incidentId).emit("secret_added", {
      id: secret.id,
      label: secret.label,
      expiresAt: secret.expiresAt,
    });
    res.json(secret);
  } catch (e) {
    res.status(500).json({ error: "Vault error" });
  }
});

api.get("/incidents/:id/secrets", async (req, res) => {
  const secrets = await prisma.secret.findMany({
    where: { incidentId: req.params.id, expiresAt: { gt: new Date() } },
  });
  const sanitized = secrets.map((s) => ({ ...s, value: "****************" }));
  res.json(sanitized);
});

api.post("/secrets/:id/reveal", async (req, res) => {
  const { id } = req.params;
  const username = req.auth?.user_metadata?.username || "Unknown";

  try {
    const secret = await prisma.secret.findUnique({ where: { id } });
    if (!secret || new Date() > secret.expiresAt) return res.status(404).json({ error: "Expired" });

    if (!secret.viewedBy.includes(username)) {
      await prisma.secret.update({ where: { id }, data: { viewedBy: { push: username } } });
      await logSystemEvent(
        secret.incidentId,
        `SECURITY ALERT: ASSET "${secret.label}" REVEALED BY ${username.toUpperCase()}`,
      );
    }

    const decrypted = decrypt(secret.value); // Decrypt!
    res.json({ value: decrypted });
  } catch (e) {
    res.status(500).json({ error: "Denied" });
  }
});

app.use("/api", api);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_URLS,
    methods: ["GET", "POST"],
  },
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error: No token"));

  try {
    // Verify using the JWKS helper we wrote above
    const decoded = await verifySocketToken(token);

    // Attach user to socket
    socket.data.user = {
      id: decoded.sub,
      username: decoded.user_metadata?.username || decoded.email?.split("@")[0] || "Unknown",
    };
    next();
  } catch (err) {
    console.error("Socket Auth Failed:", err);
    next(new Error("Authentication error"));
  }
});

app.get("/", (req, res) => {
  res.send("<h1>War Room Server Operational. Access /api for data.</h1>");
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

const logSystemEvent = async (incidentId: string, text: string) => {
  try {
    const event = await prisma.incidentEvent.create({
      data: {
        incidentId,
        text,
        userId: "SYSTEM",
        type: "system",
      },
    });

    io.to(incidentId).emit("message", {
      text: event.text,
      sender: "SYSTEM",
      timestamp: new Date(event.createdAt).toLocaleTimeString(),
      type: "system",
    });
  } catch (e) {
    console.error("Failed to log system event", e);
  }
};

const SystemState = {
  mode: "NOMINAL" as "NOMINAL" | "SPIKE_CPU" | "CACHE_DUMP" | "DB_LOCK",

  // Helper to reset state
  reset() {
    this.mode = "NOMINAL";
  },
};

const broadcastVitals = () => {
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

  switch (SystemState.mode) {
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
      vitals.alert = "DEADLOCK_DETECTED_IN_PRIMARY_DB";
      break;
  }

  io.emit("system_vitals", vitals);
};

type TerminalCommand = (io: Server, roomId: string, username: string) => void;

const TerminalCommands: Record<string, TerminalCommand> = {
  "/flush_redis": (io, roomId, username) => {
    io.to(roomId).emit("terminal_stdout", `> Executing FLUSHALL on Redis cluster...`);

    // Add small delay for realism, then force update
    setTimeout(() => {
      if (SystemState.mode === "CACHE_DUMP") {
        SystemState.reset();
        logSystemEvent(roomId, `TERMINAL: CACHE FLUSHED BY ${username}. REDIS STABILIZED.`);
        io.to(roomId).emit("play_sound", "success");
        io.to(roomId).emit(
          "terminal_stdout",
          `> SUCCESS: Cache latency normalized. System nominal.`,
        );
      } else {
        logSystemEvent(roomId, `TERMINAL: ${username} FLUSHED CACHE (NO EFFECT).`);
        io.to(roomId).emit(
          "terminal_stdout",
          `> SUCCESS: Cache flushed. No active anomalies detected.`,
        );
      }
      broadcastVitals();
    }, 1000);
  },

  "/restart_node": (io, roomId, username) => {
    io.to(roomId).emit("terminal_stdout", `> Initiating SIGTERM to Node services...`);
    io.to(roomId).emit("visual_effect", "shake");

    setTimeout(() => {
      if (["SPIKE_CPU", "DB_LOCK"].includes(SystemState.mode)) {
        SystemState.reset();
        logSystemEvent(roomId, `TERMINAL: PROCESS RESTARTED BY ${username}. CPU NORMALIZING.`);
        io.to(roomId).emit("play_sound", "success");
        io.to(roomId).emit(
          "terminal_stdout",
          `> SUCCESS: Service restarted. PID 4092 assigned. CPU Load dropping.`,
        );
      } else {
        logSystemEvent(roomId, `TERMINAL: ${username} RESTARTED NODE SERVICE.`);
        io.to(roomId).emit(
          "terminal_stdout",
          `> SUCCESS: Service restarted. System status: NOMINAL.`,
        );
      }
      broadcastVitals();
    }, 1500);
  },

  "/trigger_cpu": (io, roomId, username) => {
    SystemState.mode = "SPIKE_CPU";
    logSystemEvent(roomId, `ADMIN OVERRIDE: ${username} TRIGGERED CPU STRESS TEST.`);
    io.to(roomId).emit("terminal_stdout", "> MANUAL OVERRIDE: SIMULATING DDOS ATTACK ON CPU...");
    io.to(roomId).emit("terminal_stdout", "> ALERT: SYSTEM CRITICAL.");
    broadcastVitals();
  },

  "/trigger_cache": (io, roomId, username) => {
    SystemState.mode = "CACHE_DUMP";
    logSystemEvent(roomId, `ADMIN OVERRIDE: ${username} CORRUPTED CACHE POOL.`);
    io.to(roomId).emit(
      "terminal_stdout",
      "> MANUAL OVERRIDE: INJECTING GARBAGE DATA INTO REDIS...",
    );
    io.to(roomId).emit("terminal_stdout", "> ALERT: LATENCY SPIKE DETECTED.");
    broadcastVitals();
  },

  "/trigger_db": (io, roomId, username) => {
    SystemState.mode = "DB_LOCK";
    logSystemEvent(roomId, `ADMIN OVERRIDE: ${username} INITIATED DB DEADLOCK.`);
    io.to(roomId).emit("terminal_stdout", "> MANUAL OVERRIDE: LOCKING PRIMARY DATABASE TABLES...");
    io.to(roomId).emit("terminal_stdout", "> ALERT: QUERIES HALTED.");
    broadcastVitals();
  },

  "/fix_all": (io, roomId, username) => {
    SystemState.reset();
    logSystemEvent(roomId, `ADMIN OVERRIDE: ${username} FORCED SYSTEM RESET.`);
    io.to(roomId).emit("terminal_stdout", "> MANUAL OVERRIDE: RESETTING ALL SUBSYSTEMS TO GREEN.");
    io.to(roomId).emit("play_sound", "success");
    broadcastVitals();
  },

  ping: (io, roomId) => {
    const send = (msg: string) => io.to(roomId).emit("terminal_stdout", msg);
    send(`> Pinging internal-mainframe (10.0.0.1) with 32 bytes of data:`);
    [500, 1000, 1500].forEach((delay) => {
      setTimeout(() => send("> Reply from 10.0.0.1: bytes=32 time<1ms TTL=64"), delay);
    });
  },
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

let mode: "NOMINAL" | "SPIKE_CPU" | "CACHE_DUMP" | "DB_LOCK" = "NOMINAL";

// Heartbeat engine
setInterval(() => {
  const chaosRoll = Math.random();

  if (SystemState.mode === "NOMINAL") {
    if (chaosRoll > 0.999) SystemState.mode = "SPIKE_CPU";
    else if (chaosRoll > 0.998) SystemState.mode = "CACHE_DUMP";
    else if (chaosRoll > 0.987) SystemState.mode = "DB_LOCK";
  }

  broadcastVitals();
}, 2000);

io.on("connection", (socket: Socket) => {
  const user = socket.data.user;
  console.log(`Operative Connected: ${user.username}`);

  activeOperatives.set(socket.id, {
    id: socket.id,
    username: user.username,
    status: "OPERATIONAL",
    lastActive: Date.now(),
    location: "HQ (Lobby)",
  });
  broadcastRadar();

  socket.on("join_room", (roomId) => {
    socket.join(roomId);

    const op = activeOperatives.get(socket.id);
    if (op) {
      op.location = `Incident ${roomId}`;
      op.lastActive = Date.now();
      broadcastRadar();
    }
  });

  socket.on("send_message", async (data) => {
    const { roomId, message } = data;
    try {
      await prisma.incidentEvent.create({
        data: { incidentId: roomId, userId: user.username, text: message.text, type: "message" },
      });
      socket.to(roomId).emit("message", { ...message, sender: user.username });
    } catch (e) {
      console.error(e);
    }
  });

  socket.on("toggle_checklist", async (data) => {
    const { itemId, isCompleted, roomId } = data;

    try {
      const item = await prisma.checklistItem.update({
        where: { id: itemId },
        data: { isCompleted },
      });

      logSystemEvent(
        roomId,
        `CHECKLIST ITEM "${item.text}" MARKED ${isCompleted ? "COMPLETE" : "INCOMPLETE"}`,
      );

      // 3. Emit update
      io.to(roomId).emit("checklist_update", { itemId, isCompleted });
    } catch (e) {
      console.error("Failed to toggle item", e);
    }
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

      logSystemEvent(roomId, `ADDED CHECKLIST ITEM ${text} in ${roomId}`);
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

    logSystemEvent(roomId, `SEVERITY CHANGED TO ${severity}`);

    io.to(roomId).emit("severity_update", severity);
  });

  socket.on("create_snippet", async (data) => {
    io.to(data.roomId).emit("snippet_created");
    logSystemEvent(data.roomId, `SNIPPET CREATED AT ${Date.now()}`);
  });

  socket.on("lock_snippet", async (data) => {
    const { snippetId, roomId, username } = data;

    const snippet = await prisma.snippet.findUnique({ where: { id: snippetId } });

    if (snippet && !snippet.lockedBy) {
      await prisma.snippet.update({
        where: { id: snippetId },
        data: { lockedBy: username, lockedAt: new Date() },
      });
      io.to(roomId).emit("snippet_locked", { snippetId, username });
    }
  });

  socket.on("unlock_snippet", async (data) => {
    const { snippetId, roomId, code } = data;

    if (code !== undefined) {
      await prisma.snippet.update({
        where: { id: snippetId },
        data: { lockedBy: null, code },
      });
    } else {
      await prisma.snippet.update({
        where: { id: snippetId },
        data: { lockedBy: null },
      });
    }

    io.to(roomId).emit("snippet_unlocked", { snippetId });
  });

  socket.on("delete_snippet", (data) => {
    io.to(data.roomId).emit("snippet_deleted");
  });

  socket.on("snippet_live_change", (data) => {
    socket.to(data.roomId).emit("snippet_update", {
      snippetId: data.snippetId,
      code: data.code,
    });
  });

  socket.on("terminal_command", (data) => {
    const { command, roomId, username } = data;
    const sendTerm = (msg: string) => io.to(roomId).emit("terminal_stdout", msg);

    // 1. Check aliases first
    let cmdKey = command;
    if (command === "/clear_cache") cmdKey = "/flush_redis";
    if (command === "/kill_process") cmdKey = "/restart_node";
    if (command === "/trigger_nominal") cmdKey = "/fix_all";

    // 2. Execute Command
    const handler = TerminalCommands[cmdKey];

    if (handler) {
      handler(io, roomId, username);
    }
    // 3. Handle Special Cases (Sudo)
    else if (command.startsWith("sudo")) {
      sendTerm(`> ${username} is not in the sudoers file. This incident will be reported.`);
      logSystemEvent(roomId, `SECURITY: ${username} ATTEMPTED UNAUTHORIZED SUDO ACCESS.`);
    }
    // 4. Handle 404
    else {
      sendTerm(`> ERROR: Unknown command '${command}' or permission denied.`);
    }
  });

  socket.on("disconnect", () => {
    activeOperatives.delete(socket.id);
    broadcastRadar();
  });
});

server.listen(PORT, () => {
  console.log(`War Room Server (JWKS/ES256) Online on port ${PORT}`);
});
