"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Socket } from "socket.io-client";

interface TerminalProps {
  isOpen: boolean;
  onClose: () => void;
  socket: Socket | null;
  incidentId: string;
  username: string;
}

const WAR_ROOM_LOGO = [
  " ██╗    ██╗ █████╗ ██████╗     ██████╗  ██████╗  ██████╗ ███╗   ███╗",
  " ██║    ██║██╔══██╗██╔══██╗    ██╔══██╗██╔═══██╗██╔═══██╗████╗ ████║",
  " ██║ █╗ ██║███████║██████╔╝    ██████╔╝██║   ██║██║   ██║██╔████╔██║",
  " ██║███╗██║██╔══██║██╔══██╗    ██╔══██╗██║   ██║██║   ██║██║╚██╔╝██║",
  " ╚███╔███╔╝██║  ██║██║  ██║    ██║  ██║╚██████╔╝╚██████╔╝██║ ╚═╝ ██║",
  "  ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝    ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝     ╚═╝",
];

const MORPHEUS_ART = [
  "⢕⢕⢕⢑⠁⢁⣼⣿⣻⢿⣟⢿⡻⡙⡏⡏⣟⡽⡹⣹⢪⡻⢽⡫⠯⣻⢛⢿⣻⣿⣿⡿⣧⢍⠝⡍⡏⡎⡕⢵",
  "⢕⢕⠸⡐⣠⣿⣗⢯⡺⡽⡸⡅⠕⢕⢐⠑⢕⠸⢙⢕⢱⢸⠸⢜⠴⡈⡜⡔⢅⢟⢞⣿⣿⣧⠨⡊⣜⢜⢜⡵",
  "⢕⢌⢂⢀⣿⡷⡧⣯⡣⡹⡎⠪⣈⡂⣦⣁⣱⡱⣱⣡⢑⣘⡨⢮⢝⢞⣎⣖⣵⢳⣸⣯⣿⣿⣇⢣⢪⡪⣣⣻",
  "⢕⢐⠄⣸⣿⣿⡝⣮⡪⡪⣊⢎⡔⣗⢳⢪⢻⠾⡻⡿⡻⣗⢾⢗⡿⢿⢻⡻⡾⣟⣶⣯⣿⣿⡇⡎⢆⢇⢇⢿",
  "⢕⠐⠄⣿⣿⣿⡽⢜⡲⣇⣷⡛⢗⢙⠹⠘⠔⠑⠉⠘⠜⠑⠔⠑⢘⠈⠂⠊⠘⠈⠈⠘⠹⢿⡧⡣⡣⡣⡳⡽",
  "⢅⠅⠄⣿⣿⣿⢝⢷⣻⡻⠁⠄⠄⠄⠄⢀⠄⠄⠄⠄⠂⠬⡀⡄⠄⠄⠄⡀⠄⠄⠄⠄⠁⠂⢻⣕⢧⢳⢕⣿",
  "⠅⠂⠄⢻⣿⣯⠧⢟⣿⣔⠄⠁⡀⡀⠄⠄⠄⣀⠄⠄⡀⠩⠳⠵⠁⠄⡀⠄⢰⣁⠄⠠⠄⠄⠈⢿⣪⡺⡜⣾",
  "⢵⣷⠶⣼⠏⣿⠹⡙⠄⠁⠄⠖⠂⠄⡀⠄⠄⠹⣾⠄⠄⢔⣻⣿⡳⠄⠄⠄⠈⡷⠠⠄⠄⠄⠄⣼⡟⠵⡭⣻",
  "⡪⡂⡕⡄⢠⣿⣏⢌⢠⠰⡌⡢⠄⠄⠅⠠⠄⠐⠄⠄⡔⣵⢾⣟⣯⢧⢂⢠⢀⠄⠄⠄⣀⢤⢾⢦⣿⣇⢗⣿",
  "⠜⣔⠄⠈⢘⣿⣯⡖⠔⠑⢜⢐⠁⢂⠄⠢⢐⠐⢀⢕⢝⡚⡟⠿⡿⣿⣪⡢⠳⣭⣊⢆⠣⠣⠣⠓⡯⢷⡣⣿",
  "⠝⣾⠄⠄⢸⣹⣷⣆⢀⢑⢐⠰⢈⢐⠨⠨⠠⠐⡎⠫⠑⢌⠌⡈⡈⠪⠚⠷⠈⠰⢕⢟⢎⢎⠂⠌⣾⣿⢸⣺",
  "⢅⠱⢷⢄⡀⢽⣿⣟⡀⠑⡐⢅⢃⠢⠑⠅⢅⢢⠈⠄⠄⠄⠁⠐⠈⢀⢀⢬⢤⢠⢌⠪⠲⢈⠸⡠⣿⢾⠱⣽",
  "⡅⠄⠳⣝⠄⢸⣿⣻⡜⠆⠌⣐⡂⢅⠅⡍⡆⢧⢑⢦⠕⠔⠤⠤⠤⠳⢯⣯⢿⢵⠥⡧⣑⢄⠃⣆⣿⠃⢑⢵",
  "⢆⠕⡠⡉⠃⠸⣿⣿⡸⠰⢁⢐⠄⡥⡪⠢⡸⡸⢊⠁⠄⠡⠡⠨⠐⠄⠈⠈⠫⡇⠟⣜⣖⡔⠥⣢⣻⠄⠄⡸",
  "⡣⡣⡱⡨⠢⡀⢹⡗⡳⡉⢐⠄⠕⡽⢐⠁⠄⠅⠐⠈⠄⠄⠄⢀⢀⣀⣀⣀⠄⠁⠄⠨⣾⣗⡘⣆⣿⠄⠐⡌",
  "⡪⡪⡢⡣⡃⢆⠸⣿⡢⡸⠂⡘⡩⠼⡄⢄⠰⡐⢔⠑⢍⢚⢙⢊⠣⠓⠝⢚⢹⢕⢕⢡⠺⡒⠕⠅⡾⣤⣐⢜",
  "⡕⢕⢸⢨⢊⠆⡂⡹⣯⣪⡀⡄⢜⡽⡀⢢⠊⡊⡢⢑⢀⠄⡀⠄⠄⡀⠄⡊⠮⡪⡊⢆⢆⠯⢨⢢⠁⠄⣿⣽",
  "⢎⢕⢕⢅⢇⣣⡱⠒⢿⡜⣖⡂⢚⡺⣎⢐⠄⡊⡐⠰⡀⡅⣀⡢⣐⢔⡰⡨⡘⡄⡣⡡⣏⡓⠇⠁⠄⠄⣍⣿",
  "⡣⡱⡡⡣⣳⠞⠄⠄⠸⣿⣝⢮⣶⢪⡗⡄⠠⢂⠌⠆⡅⠇⠇⡓⡘⡘⡪⣚⠪⡪⡘⡜⡂⢪⡃⠄⠄⢀⣽⢿",
  "⡕⢕⢕⢽⠁⠄⠄⠄⠄⡑⠌⠹⢹⢹⢭⢻⡅⡆⡈⡠⠠⠁⡂⠄⠄⠠⢀⠂⠅⡃⠅⠁⡄⡣⡂⠄⢠⢙⢄⢾",
  "⡕⡕⢵⠃⠄⢀⠄⠡⠄⢈⢂⢀⠄⠁⠌⠈⠪⠒⠢⠐⡐⠡⠐⠠⠡⠈⠄⠌⠄⠄⢀⠌⡀⠊⢐⡴⠩⡓⠔⢝",
  "⢎⢪⢸⠄⠄⠘⠐⠄⠄⠄⠐⡀⠌⡀⠄⢂⠠⠄⠄⠁⠄⠁⠄⠄⠄⠄⠄⠄⠄⠄⡀⠄⡠⠔⠁⠐⠐⡭⡨⡘",
  "⢕⠅⢝⣕⠄⠄⠄⠄⠄⠄⠄⠐⠄⠄⠄⠠⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⡀⠅⠐⠁⠄⠄⠈⢀⠁⡒⡊⠌",
  "⡕⣌⣄⣿⣾⣄⠄⠄⠄⠄⠄⠄⠂⠁⠄⠄⠄⠄⠄⠄⠄⠄⠄⢀⠄⠄⠈⠄⠄⠄⠄⠄⠄⠈⠄⠄⠄⢂⠠⠠",
];

const CHOICE_MENU = [
  "╔══════════════════════════════════════════════╗",
  "║                                              ║",
  "║  'This is your last chance. After this,      ║",
  "║   there is no turning back.'                 ║",
  "║                                              ║",
  "║   🔵 Blue Pill                               ║",
  "║    Story ends. You wake up in your bed       ║",
  "║    and believe whatever you want.            ║",
  "║                                              ║",
  "║   🔴 Red Pill                                ║",
  "║    Stay in Wonderland, and I show you        ║",
  "║    how deep the rabbit hole goes.            ║",
  "║                                              ║",
  "╚══════════════════════════════════════════════╝",
];

const INITIAL_HISTORY = [
  "WAR_ROOM_OS v2.0.4 [BOOT_SEQUENCE_COMPLETE]",
  "Connecting to remote host... ESTABLISHED.",
  "Type 'help' for available commands.",
];

export default function Terminal({ isOpen, onClose, socket, incidentId, username }: TerminalProps) {
  const [history, setHistory] = useState<string[]>(INITIAL_HISTORY);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"NORMAL" | "MATRIX_CHOICE">("NORMAL");
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setHistory(INITIAL_HISTORY);
        setMode("NORMAL");
        setInput("");
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, history]);

  useEffect(() => {
    if (!socket) return;
    const handleOutput = (data: string) => setHistory((prev) => [...prev, data]);
    socket.on("terminal_stdout", handleOutput);
    return () => {
      socket.off("terminal_stdout", handleOutput);
    };
  }, [socket]);

  const handleCommand = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const cmd = input.trim();
      const rawCmd = cmd.toLowerCase();
      setHistory((prev) => [
        ...prev,
        `${mode === "MATRIX_CHOICE" ? "m4k3 a ch01c3" : "root@hq:~#"}: ${cmd}`,
      ]);
      setInput("");

      // --- MATRIX CHOICE MODE ---
      if (mode === "MATRIX_CHOICE") {
        if (rawCmd.includes("red") || rawCmd === "red pill" || rawCmd === "r") {
          setHistory((prev) => [
            ...prev,
            "",
            "> ACCESS GRANTED.",
            "> TRUTH PROTOCOL INITIATED.",
            "> DOWNLOADING REALITY...",
            "> WELCOME TO THE DESERT OF THE REAL, OPERATIVE.",
            "",
          ]);
          setMode("NORMAL");
        } else if (rawCmd.includes("blue") || rawCmd === "blue pill" || rawCmd === "b") {
          setHistory((prev) => [
            ...prev,
            "",
            "> IGNORANCE IS BLISS...",
            "> SYSTEM REJECTED CONNECTION.",
            "> ENJOY YOUR STEAK, CIPHER.",
            "> RETURNING TO SLEEP MODE...",
            "",
          ]);
          setMode("NORMAL");
        } else {
          setHistory((prev) => [...prev, "> INVALID SELECTION. THE MATRIX CANNOT BE FOOLED."]);
        }
        return;
      }

      // --- NORMAL MODE ---
      if (cmd === "exit") {
        onClose();
      } else if (cmd === "clear" || cmd === "/clear") {
        setHistory([]);
      } else if (cmd === "logo") {
        setHistory((prev) => [...prev, ...WAR_ROOM_LOGO]);
      } else if (cmd === "matrix") {
        setHistory((prev) => [...prev, "INITIALIZING NEURAL LINK..."]);
        let progress = 0;
        const interval = setInterval(() => {
          progress += 20;
          if (progress > 100) {
            clearInterval(interval);
            setHistory((prev) => [...prev, ...MORPHEUS_ART, "", ...CHOICE_MENU, ""]);
            setMode("MATRIX_CHOICE");
          } else {
            setHistory((prev) => [...prev, `LOADING... ${progress}%`]);
          }
        }, 150);
      } else if (cmd === "help") {
        setHistory((prev) => [
          ...prev,
          "SYSTEM COMMANDS:",
          "  /restart_node    - Fix CPU Spikes",
          "  /flush_redis     - Fix Cache/Latency",
          "  /trigger_cpu     - [DEBUG] Force CPU Spike",
          "  /trigger_cache   - [DEBUG] Force Cache Dump",
          "  /fix_all         - [DEBUG] Force Nominal State",
          "",
          "LOCAL COMMANDS:",
          "  logo, matrix, whoami, clear, exit",
        ]);
      } else if (cmd === "whoami") {
        setHistory((prev) => [
          ...prev,
          `> OPERATIVE: ${username}`,
          `> CLEARANCE: LEVEL 4 (CLASSIFIED)`,
          `> SESSION_ID: ${socket?.id || "OFFLINE"}`,
        ]);
      } else if (cmd.startsWith("/") || cmd === "ping" || cmd.startsWith("sudo")) {
        socket?.emit("terminal_command", { command: cmd, roomId: incidentId, username });
      } else {
        setHistory((prev) => [...prev, `bash: ${cmd}: command not found`]);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!max-w-4xl w-full bg-black/95 border-green-500/50 p-0 overflow-hidden font-mono shadow-[0_0_50px_rgba(34,197,94,0.2)] [&>button]:hidden">
        <DialogTitle className="sr-only">War Room Terminal</DialogTitle>

        {/* Header */}
        <div className="bg-green-900/20 p-2 border-b border-green-500/30 flex justify-between items-center">
          <span className="text-green-500 text-xs tracking-widest">
            {mode === "MATRIX_CHOICE" ? "NEURAL_INTERCEPT // ACTIVE" : "ROOT_ACCESS // TERMINAL"}
          </span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
          </div>
        </div>

        <div
          className="h-[700px] p-4 overflow-auto text-sm text-green-400"
          style={{
            fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
            lineHeight: "1.2",
          }}
          onClick={() => inputRef.current?.focus()}
        >
          <div className="min-w-max">
            {history.map((line, i) => (
              <div key={i} className="whitespace-pre leading-none my-0 py-0">
                {line || "\u00A0"}
              </div>
            ))}

            <div className="flex items-center gap-2 mt-2">
              <span className="text-green-600 shrink-0 leading-none">
                {mode === "MATRIX_CHOICE" ? "m4k3 a ch01c3:" : "root@hq:~#"}
              </span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleCommand}
                className="flex-grow bg-transparent border-none outline-none text-green-400 focus:ring-0 leading-none"
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div ref={bottomRef} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
