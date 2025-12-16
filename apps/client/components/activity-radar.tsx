"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { supabase } from "@/lib/supabase";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

type Operative = {
  id: string;
  username: string;
  status: "OPERATIONAL" | "INPUTTING_COMMAND" | "DORMANT";
  location: string;
  lastActive: number;
};

export default function ActivityRadar() {
  const [operatives, setOperatives] = useState<Operative[]>([]);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [incidentTitles, setIncidentTitles] = useState<Record<string, string>>({});

  const socketRef = useRef<Socket | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login" || pathname === "/register") return;

    socketRef.current = io("http://localhost:4000");

    const identify = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && socketRef.current) {
        const username = user.user_metadata?.username || user.email?.split("@")[0];
        setMyUsername(username);
        socketRef.current.emit("identify_operative", { username });
      }
    };

    socketRef.current.on("connect", () => {
      identify();
    });

    socketRef.current.on("radar_update", (rawList: Operative[]) => {
      setOperatives(rawList);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    const fetchMissingTitles = async () => {
      const neededIds = new Set<string>();

      operatives.forEach((op) => {
        if (
          op.location !== "HQ (Lobby)" &&
          op.location !== "Unknown Location" &&
          !incidentTitles[op.location]
        ) {
          neededIds.add(op.location);
        }
      });

      if (neededIds.size === 0) return;

      const newTitles: Record<string, string> = {};

      await Promise.all(
        Array.from(neededIds).map(async (rawLocation) => {
          try {
            const cleanId = rawLocation
              .replace(/^(Incident|Room)/i, "")
              .replace(/^[:\s]+/, "")
              .trim();

            console.log(`[Radar] Fetching title for: "${cleanId}" (Raw: "${rawLocation}")`);

            const data = (await api.get(`/incidents/${cleanId}`)) as { title: string };

            if (data && data.title) {
              newTitles[rawLocation] = data.title;
            } else {
              console.warn(`[Radar] ID ${cleanId} found, but no title returned.`);
              newTitles[rawLocation] = "Untitled Incident";
            }
          } catch (e) {
            console.error(`[Radar] Failed to fetch ${rawLocation}`, e);
            newTitles[rawLocation] = "Unknown Signal";
          }
        }),
      );

      setIncidentTitles((prev) => ({ ...prev, ...newTitles }));
    };

    if (operatives.length > 0) {
      fetchMissingTitles();
    }
  }, [operatives, incidentTitles]);

  if (pathname === "/login" || pathname === "/register") return null;

  const uniqueMap = new Map<string, Operative>();

  operatives.forEach((op) => {
    if (op.username === myUsername && pathname === "/") {
      op.location = "HQ (Lobby)";
    }

    const existing = uniqueMap.get(op.username);

    if (!existing) {
      uniqueMap.set(op.username, op);
    } else {
      const isTyping = op.status === "INPUTTING_COMMAND";
      const wasNotTyping = existing.status !== "INPUTTING_COMMAND";

      const inRoom = op.location !== "HQ (Lobby)";
      const wasInHQ = existing.location === "HQ (Lobby)";

      const isNewer = op.lastActive > existing.lastActive;

      if ((isTyping && wasNotTyping) || (inRoom && wasInHQ) || (inRoom && !wasInHQ && isNewer)) {
        uniqueMap.set(op.username, op);
      }
    }
  });

  const sortedOperatives = Array.from(uniqueMap.values()).sort((a, b) => {
    if (a.status === "DORMANT" && b.status !== "DORMANT") return 1;
    if (a.status !== "DORMANT" && b.status === "DORMANT") return -1;
    return 0;
  });

  return (
    <div className="fixed bottom-0 left-0 right-0 h-12 bg-black/90 border-t border-cyan-900/50 backdrop-blur-md flex items-center px-6 gap-6 z-50 overflow-x-auto no-scrollbar">
      <div className="text-xs font-mono text-cyan-700 tracking-widest whitespace-nowrap">
        NET_ACTIVITY //
      </div>

      {sortedOperatives.map((op) => (
        <div
          key={op.username}
          className="flex items-center gap-2 font-mono text-xs whitespace-nowrap"
        >
          {/* Status LED */}
          <div className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 
                ${op.status === "INPUTTING_COMMAND" ? "bg-green-400 duration-75" : ""} 
                ${op.status === "OPERATIONAL" ? "bg-cyan-500 duration-1000" : ""}
                ${op.status === "DORMANT" ? "hidden" : ""}
              `}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-2 w-2
                ${op.status === "INPUTTING_COMMAND" ? "bg-green-500" : ""} 
                ${op.status === "OPERATIONAL" ? "bg-cyan-600" : ""}
                ${op.status === "DORMANT" ? "bg-gray-700" : ""}
              `}
            ></span>
          </div>

          <span className={op.status === "DORMANT" ? "text-gray-600" : "text-cyan-100"}>
            {op.username.toUpperCase()}
          </span>

          {op.status === "INPUTTING_COMMAND" && (
            <span className="text-green-500 animate-pulse">[INPUTTING]</span>
          )}

          {op.status === "DORMANT" && <span className="text-gray-700">[DORMANT]</span>}

          <span className="text-cyan-900 text-[10px]">
            ::{incidentTitles[op.location] || op.location}
          </span>
        </div>
      ))}
    </div>
  );
}
