"use client";

import React, { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useSfx } from "@/hooks/use-sfx";
import CodeEditor from "@/components/code-editor";
import { api } from "@/lib/api";
import SystemVitalsWidget from "@/components/system-vitals";
import { GitHubLogoIcon, TrashIcon, CheckCircledIcon } from "@radix-ui/react-icons";
import BlackBox from "@/components/black-box";
import { motion, useAnimation } from "framer-motion";
import Armory from "@/components/armory";
import Terminal from "@/components/terminal";
import { getSocketUrl, socketConfig } from "@/lib/socket-config";

interface RoomPageProps {
  params: Promise<{ id: string }>;
}

type Message = {
  text: string;
  sender: string;
  timestamp: string;
  type?: "message" | "system";
};

type ChecklistItem = {
  id: string;
  text: string;
  isCompleted: boolean;
};

type DBMessage = {
  text: string;
  userId: string;
  createdAt: string;
};

type DBIncident = {
  id: string;
  title: string;
  severity: string;
  createdBy: string;
  status: string;
};

export default function IncidentRoom({ params }: RoomPageProps) {
  const { id: incidentId } = use(params);

  const router = useRouter();
  const [username, setUsername] = useState("Unknown Agent");

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [severity, setSeverity] = useState("HIGH");
  const [creator, setCreator] = useState("");

  const { playMessage, playSuccess, playTyping } = useSfx();
  const controls = useAnimation();

  const [socket, setSocket] = useState<Socket | null>(null);

  // Authentication Check
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
      } else {
        const name = user.user_metadata?.username || user.email?.split("@")[0];
        setUsername(name);
      }
    };
    getUser();
  }, [router]);

  // Data Fetching & Socket Connection
  useEffect(() => {
    let activeSocket: Socket | null = null;
    let isMounted = true;

    const initDataAndSocket = async () => {
      // --- A. Data Fetching (Keep your existing logic) ---
      if (incidentId) {
        try {
          const [msgData, checkData, sevData] = await Promise.all([
            api.get<DBMessage[]>(`/incidents/${incidentId}/messages`),
            api.get<ChecklistItem[]>(`/incidents/${incidentId}/checklist`),
            api.get<DBIncident>(`/incidents/${incidentId}`),
          ]);

          if (!isMounted) return;

          if (Array.isArray(msgData)) {
            const history = msgData.map((event) => ({
              text: event.text,
              sender: event.userId,
              timestamp: new Date(event.createdAt).toLocaleTimeString(),
              type: "message" as const,
            }));
            setMessages(history);
          }

          if (Array.isArray(checkData)) setChecklist(checkData);

          if (sevData) {
            setSeverity(sevData.severity);
            setCreator(sevData.createdBy);
            setTitle(sevData.title);
          }
        } catch (e) {
          console.error("Failed to fetch initial data:", e);
        }
      }

      // --- B. Socket Connection ---
      const session = await supabase.auth.getSession();

      if (!isMounted) return;

      const token = session.data.session?.access_token;

      if (!token) return;

      // Create the socket
      activeSocket = io(getSocketUrl(), {
        auth: { token },
        ...socketConfig,
      });

      if (!isMounted) {
        activeSocket.disconnect();
        return;
      }

      // Update React State
      setSocket(activeSocket);

      // --- C. Socket Listeners ---

      activeSocket.on("connect", () => {
        console.log("Connected to ID:", incidentId);
        if (isMounted) setIsConnected(true);

        activeSocket?.emit("join_room", incidentId);
      });

      activeSocket.on("disconnect", () => {
        setIsConnected(false);
      });

      activeSocket.on("connect_error", (err) => {
        console.error("Socket Connection Error:", err.message);
        setIsConnected(false);
      });

      activeSocket.on("message", (msg: Message) => {
        setMessages((prev) => [...prev, msg]);
        if (msg.sender !== username) playMessage();
      });

      activeSocket.on("checklist_update", (data) => {
        setChecklist((prev) =>
          prev.map((item) =>
            item.id === data.itemId ? { ...item, isCompleted: data.isCompleted } : item,
          ),
        );
      });

      activeSocket.on("new_checklist_item", (item) => {
        setChecklist((prev) => {
          if (prev.some((i) => i.id === item.id)) return prev;
          return [...prev, item];
        });
      });

      activeSocket.on("display_typing", (user) =>
        setTypingUsers((prev) => new Set(prev).add(user)),
      );
      activeSocket.on("hide_typing", (user) => {
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(user);
          return newSet;
        });
      });

      activeSocket.on("severity_update", (newSev) => {
        setSeverity(newSev);
        playSuccess();
      });

      activeSocket.on("incident_resolved", () => {
        setStatus("RESOLVED");
        playSuccess();
        alert("INCIDENT RESOLVED. COMMAND STANDING DOWN");
        setTimeout(() => router.push("/"), 1200);
      });

      activeSocket.on("incident_deleted", () => {
        alert("INCIDENT LOGS PURGED. RETURNING TO HQ.");
        router.push("/");
      });

      activeSocket.on("visual_effect", (effect) => {
        if (effect === "shake") {
          controls.start({
            x: [0, -5, 5, -5, 5, 0],
            y: [0, -5, 5, 0],
            transition: { duration: 0.5, ease: "easeInOut" },
          });
        }
      });

      activeSocket.on("play_sound", (type) => {
        if (type === "success") playSuccess();
      });

      // Emits for joining
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && activeSocket.connected) {
        // Server now auto-identifies from token, but we still need to join the room
        activeSocket.emit("join_room", incidentId);
      }
    };

    initDataAndSocket();

    // 4. CLEANUP FUNCTION
    return () => {
      isMounted = false;
      if (activeSocket) {
        console.log("Cleaning up socket connection...");
        activeSocket.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  // Chat Function
  const sendMessage = () => {
    if (!currentMessage.trim() || !socket) return;

    const payload: Message = {
      text: currentMessage,
      sender: username,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, payload]);

    socket.emit("send_message", {
      roomId: incidentId,
      message: payload,
    });

    setCurrentMessage("");
  };

  const lastTypingEmit = useRef<number>(0);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentMessage(e.target.value);
    if (Math.random() > 0.5) playTyping();

    if (!socket) return;

    const now = Date.now();
    // Throttle: Only emit 'typing' if 2 seconds have passed since the last emit
    if (now - lastTypingEmit.current > 2000) {
      socket.emit("typing", { roomId: incidentId, username });
      lastTypingEmit.current = now;
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Set timeout to stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      socket?.emit("stop_typing", { roomId: incidentId, username });
    }, 2000);
  };

  const handleResolve = async () => {
    if (!confirm("CONFIRM: Mark incident as RESOLVED?")) return;
    try {
      await api.patch(`/incidents/${incidentId}/resolve`, {});
    } catch (e) {
      console.error("Resolve failed", e);
    }
  };

  const handleDelete = async () => {
    const code = prompt("CONFIRM DELETION: Type 'DELETE' to confirm");

    if (code !== "DELETE") return;
    try {
      await api.delete(`/incidents/${incidentId}`);
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  const chatMessages = messages.filter((m) => m.type !== "system");
  const logs = messages.filter((m) => m.type !== "message");

  const toggleItem = (itemId: string, currentStatus: boolean) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isCompleted: !currentStatus } : item)),
    );

    if (!currentStatus) {
      playSuccess();
    }

    socket?.emit("toggle_checklist", {
      roomId: incidentId,
      itemId,
      isCompleted: !currentStatus,
    });
  };

  const addItem = () => {
    if (!newItemText.trim() || !socket) return;

    socket.emit("add_checklist_item", {
      roomId: incidentId,
      text: newItemText,
    });

    setNewItemText("");
  };

  const changeSeverity = (newSev: string) => {
    setSeverity(newSev);
    socket?.emit("update_severity", {
      roomId: incidentId,
      severity: newSev,
    });
  };

  const getSevColor = (sev: string) => {
    switch (sev) {
      case "CRITICAL":
        return "bg-red-600";
      case "HIGH":
        return "bg-orange-600";
      case "MEDIUM":
        return "bg-yellow-600";
      case "LOW":
        return "bg-green-600";
      default:
        return "bg-gray-600";
    }
  };

  return (
    <motion.div
      animate={controls}
      className="p-6 max-w-[1800px] mx-auto h-screen flex flex-col gap-4 overflow-hidden pb-14"
    >
      <div className="flex justify-between items-center pb-2 border-b border-gray-800 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (window.location.href = "/")}
              className="text-muted-foreground hover:text-cyan-400 pl-0 -ml-2 z-50 relative"
            >
              ⤶ Return to Base
            </Button>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-cyan-400">
            {title || "Incident Room"}
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            ID: <span className="font-mono">{incidentId}</span>
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? "bg-green-500 shadow-[0_0_10px_#22c55e]" : "bg-red-500"
              }`}
            ></span>
            {isConnected ? "Connected" : "Reconnecting..."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsTerminalOpen(true)}
            className="bg-green-950/30 text-green-500 border-green-900 hover:bg-green-900/50"
          >
            <span className="mr-2">&gt;_</span> SHELL
          </Button>
          <a
            href="https://github.com/ber1ii/war-room-code-editor-snippets"
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
              <GitHubLogoIcon className="mr-2 h-4 w-4" /> Repo
            </Button>
          </a>

          {/* 2. BLACK BOX TRIGGER */}
          <BlackBox logs={logs} />

          {/* 3. SEVERITY / ADMIN CONTROLS */}
          <div className="h-6 w-px bg-gray-800 mx-2"></div>

          {username === creator ? (
            <div className="flex items-center gap-2">
              {/* Resolve Button */}
              {status !== "RESOLVED" && (
                <Button
                  size="sm"
                  onClick={handleResolve}
                  className="h-8 bg-green-900/20 hover:bg-green-800 text-green-500 border border-green-900/50"
                >
                  <CheckCircledIcon className="mr-2 h-4 w-4" /> RESOLVE
                </Button>
              )}

              {/* Severity Dropdown */}
              <select
                value={severity}
                onChange={(e) => changeSeverity(e.target.value)}
                className={`h-8 px-3 rounded text-xs font-bold text-white border-none outline-none cursor-pointer ${getSevColor(
                  severity,
                )}`}
              >
                <option value="LOW" className="bg-black">
                  LOW
                </option>
                <option value="MEDIUM" className="bg-black">
                  MEDIUM
                </option>
                <option value="HIGH" className="bg-black">
                  HIGH
                </option>
                <option value="CRITICAL" className="bg-black">
                  CRITICAL
                </option>
              </select>

              {/* Delete Button */}
              <Button
                size="sm"
                onClick={handleDelete}
                className="h-8 bg-red-950/30 hover:bg-red-700 text-red-500 border border-red-900"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Badge className={`${getSevColor(severity)} cursor-default`}>
              SEVERITY: {severity}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 flex-grow overflow-hidden h-full">
        <div className="col-span-3 flex flex-col gap-4 h-full overflow-hidden">
          <Card className="bg-black/40 border-cyan-900/50 flex-grow overflow-hidden flex flex-col">
            <CardHeader className="py-3 shrink-0">
              <CardTitle className="text-cyan-500 text-sm">Protocol</CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto flex-grow">
              <ul className="space-y-3 font-mono text-sm">
                {checklist.map((item) => (
                  <li
                    key={item.id}
                    onClick={() => toggleItem(item.id, item.isCompleted)}
                    className={`flex items-center gap-2 cursor-pointer select-none ${
                      item.isCompleted ? "text-green-400" : "text-gray-400 hover:text-cyan-300"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 border rounded flex items-center justify-center ${
                        item.isCompleted
                          ? "border-green-500 bg-green-500/20"
                          : "border-cyan-500 bg-cyan-500/10"
                      }`}
                    >
                      {item.isCompleted && "✓"}
                    </div>
                    <span className={item.isCompleted ? "line-through opacity-70" : ""}>
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
            {/* Input Footer */}
            <div className="p-4 border-t border-cyan-900/30 shrink-0 flex gap-2">
              <input
                type="text"
                placeholder="Add task..."
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem()}
                className="flex h-8 w-full rounded-md border border-cyan-900/50 bg-black/50 px-2 text-xs text-cyan-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
              />
              <Button
                size="sm"
                onClick={addItem}
                className="h-8 bg-cyan-900/50 hover:bg-cyan-800 text-cyan-200 text-xs border border-cyan-700/50"
              >
                +
              </Button>
            </div>
          </Card>

          <div className="shrink-0">
            <Armory incidentId={incidentId} socket={socket} />
          </div>
          <div className="shrink-0">
            <SystemVitalsWidget socket={socket} />
          </div>
        </div>

        <Card className="col-span-3 bg-black/40 border-purple-900/50 flex flex-col h-full overflow-hidden">
          <CardHeader className="py-3 shrink-0">
            <CardTitle className="text-purple-400 text-sm">Live Log</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col justify-end overflow-hidden">
            <div className="flex-grow overflow-y-auto space-y-2 mb-4 pr-2 font-mono text-sm">
              {chatMessages.map((m, i) => (
                <div key={i} className="animate-in fade-in slide-in-from-bottom-1">
                  <span className="text-xs text-muted-foreground mr-2">[{m.timestamp}]</span>
                  <span
                    className={`font-bold mr-2 ${
                      m.sender === username ? "text-cyan-400" : "text-purple-400"
                    }`}
                  >
                    {m.sender === username ? "[YOU]" : `[${m.sender}]`}
                  </span>
                  <span className="text-gray-200">{m.text}</span>
                </div>
              ))}
            </div>

            <div className="shrink-0">
              {typingUsers.size > 0 && (
                <div className="text-xs text-cyan-500/80 font-mono mb-2 animate-pulse pl-1">
                  {Array.from(typingUsers).join(", ")} is entering commands...
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={currentMessage}
                  onChange={handleInputChange}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  type="text"
                  placeholder="Enter command..."
                  className="flex h-10 w-full rounded-md border border-purple-900/50 bg-black/50 px-3 py-2 text-sm text-cyan-100 placeholder:text-purple-700/50 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                />
                <Button
                  onClick={sendMessage}
                  className="bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="col-span-6 h-full overflow-hidden">
          <CodeEditor
            incidentId={incidentId}
            username={username}
            socket={socket}
            className="h-full"
          />
        </div>
      </div>

      <Terminal
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        socket={socket}
        incidentId={incidentId}
        username={username}
      />
    </motion.div>
  );
}
