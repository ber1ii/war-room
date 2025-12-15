"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Card } from "@/components/ui/card";
import { useSfx } from "@/hooks/use-sfx";

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

interface SystemVitalsProps {
  socket: Socket | null;
}

export default function SystemVitalsWidget({ socket }: SystemVitalsProps) {
  const [stats, setStats] = useState<SystemVitals | null>(null);
  const { playCritical, playWarning } = useSfx();

  const prevStatus = useRef<string>("NOMINAL");

  useEffect(() => {
    if (!socket) return;

    // 2. Listen to existing socket
    const handleVitals = (data: SystemVitals) => {
      setStats(data);

      if (data.status !== prevStatus.current) {
        if (data.status === "CRITICAL") playCritical();
        if (data.status === "WARNING") playWarning();
      }

      prevStatus.current = data.status;
    };

    socket.on("system_vitals", handleVitals);

    return () => {
      socket.off("system_vitals", handleVitals);
    };
  }, [socket, playCritical, playWarning]);

  if (!stats)
    return (
      <div className="text-xs text-muted-foreground animate-pulse">ESTABLISHING UPLINK...</div>
    );

  // Dynamic styles based on Status
  const isCritical = stats.status === "CRITICAL";
  const isWarning = stats.status === "WARNING";

  const borderColor = isCritical
    ? "border-red-500"
    : isWarning
    ? "border-yellow-500"
    : "border-cyan-900/50";
  const textColor = isCritical ? "text-red-500" : isWarning ? "text-yellow-500" : "text-cyan-400";
  const glow = isCritical ? "shadow-[0_0_15px_rgba(239, 68, 68, 0.5)]" : "";

  return (
    <Card
      className={`w-full bg-black/40 backdrop-blur-md p-4 border transition-all duration-300 ${borderColor} ${glow}`}
    >
      {/* HEADER */}
      <div className="flex justify-between items-center mb-3 border-b border-gray-800 pb-2">
        <h3 className={`text-xs font-bold tracking-widest ${textColor}`}>SYS_DIAGNOSTIC</h3>
        <div
          className={`text-[10px] font-mono px-2 py-0.5 rounded ${
            isCritical ? "bg-red-950 text-red-200" : "bg-cyan-950/30 text-cyan-200"
          }`}
        >
          {stats.status}
        </div>
      </div>

      {/* ALERT BANNER */}
      {stats.alert && (
        <div className="mb-3 bg-red-500/10 border border-red-500/50 p-2 rounded text-[10px] text-red-200 font-mono animate-pulse">
          ⚠ {stats.alert}
        </div>
      )}

      {/* METRICS GRID */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[10px] text-gray-400">
        {/* CPU */}
        <div className="space-y-1">
          <div className="flex justify-between">
            <span>CPU_LOAD</span>
            <span className={stats.cpu > 80 ? "text-red-400" : "text-cyan-200"}>
              {stats.cpu.toFixed(0)}%
            </span>
          </div>
          <div className="h-1 w-full bg-gray-800 rounded overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                stats.cpu > 80 ? "bg-red-500" : "bg-cyan-500"
              }`}
              style={{ width: `${stats.cpu}%` }}
            />
          </div>
        </div>

        {/* MEMORY */}
        <div className="space-y-1">
          <div className="flex justify-between">
            <span>MEM_USAGE</span>
            <span className="text-cyan-200">{stats.memory.toFixed(0)}%</span>
          </div>
          <div className="h-1 w-full bg-gray-800 rounded overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-500"
              style={{ width: `${stats.memory}%` }}
            />
          </div>
        </div>

        {/* DB IOPS */}
        <div>
          <span>DB_IOPS</span>
          <div className={`text-sm ${stats.db_iops > 2000 ? "text-yellow-400" : "text-white"}`}>
            {stats.db_iops.toLocaleString()}
          </div>
        </div>

        {/* LATENCY */}
        <div>
          <span>LATENCY</span>
          <div className={`text-sm ${stats.latency > 100 ? "text-red-400" : "text-white"}`}>
            {stats.latency.toFixed(0)}ms
          </div>
        </div>

        {/* CACHE HIT */}
        <div>
          <span>CACHE_HIT</span>
          <div className={`text-sm ${stats.cache_hit < 50 ? "text-red-400" : "text-green-400"}`}>
            {stats.cache_hit.toFixed(1)}%
          </div>
        </div>

        {/* ERROR RATE */}
        <div>
          <span>ERR_RATE</span>
          <div
            className={`text-sm ${stats.error_rate > 2 ? "text-red-500 font-bold" : "text-white"}`}
          >
            {stats.error_rate.toFixed(2)}%
          </div>
        </div>
      </div>
    </Card>
  );
}
