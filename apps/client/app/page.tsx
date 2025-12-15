"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
// IMPORT THE API HELPER
import { api } from "@/lib/api";

type Incident = {
  id: string;
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  isActive: boolean;
  createdAt: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [newIncidentTitle, setNewIncidentTitle] = useState("");
  const [newSeverity, setNewSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");

  // Fetch Incidents
  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const data = await api.get<Incident[]>("/incidents");
        setIncidents(data);
      } catch (e) {
        console.error("Failed to load incidents", e);
      }
    };
    fetchIncidents();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Create Incident
  const handleCreate = async () => {
    if (!newIncidentTitle.trim()) return;

    try {
      await api.post("/incidents", {
        title: newIncidentTitle,
        severity: newSeverity,
      });

      setNewIncidentTitle("");
      setNewSeverity("HIGH");

      // Refresh list
      const data = await api.get<Incident[]>("/incidents");
      setIncidents(data);
    } catch (e) {
      console.error("Failed to create incident", e);
    }
  };

  // (Helper function for colors remains the same...)
  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case "CRITICAL":
        return "bg-red-600 hover:bg-red-700 text-white shadow-[0_0_10px_rgba(220,38,38,0.5)]";
      case "HIGH":
        return "bg-orange-600 hover:bg-orange-700 text-white";
      case "MEDIUM":
        return "bg-yellow-600 hover:bg-yellow-700 text-white";
      case "LOW":
        return "bg-green-600 hover:bg-green-700 text-white";
      default:
        return "bg-gray-600";
    }
  };

  return (
    // ... (Your JSX remains exactly the same)
    <div className="p-8 max-w-6xl mx-auto space-y-8 pb-24">
      <div className="flex justify-between items-center border-b border-gray-800 pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-600">
            WAR ROOM // DASHBOARD
          </h1>
          <p className="text-muted-foreground font-mono mt-2">Active Incident Command Center</p>
        </div>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="border-red-900/50 text-red-400 hover:bg-red-950/30"
        >
          Disconnect
        </Button>
      </div>

      <Card className="bg-black/40 border-cyan-900/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-cyan-400 text-lg font-mono uppercase tracking-widest">
            Declare New Incident
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <Input
                placeholder="Incident Title..."
                value={newIncidentTitle}
                onChange={(e) => setNewIncidentTitle(e.target.value)}
                className="bg-black/50 border-cyan-800/50 text-cyan-100 font-mono h-12"
              />
              <Button
                onClick={handleCreate}
                size="lg"
                className="bg-red-600 hover:bg-red-700 text-white font-bold tracking-wider px-8 h-12"
              >
                DECLARE
              </Button>
            </div>
            <div className="flex gap-2">
              {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setNewSeverity(level)}
                  className={`px-4 py-2 rounded text-xs font-bold font-mono border transition-all ${
                    newSeverity === level
                      ? getSeverityColor(level) + " border-transparent scale-105"
                      : "bg-transparent border-gray-800 text-gray-500 hover:border-gray-600"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {incidents.map((incident) => (
          <Link href={`/room/${incident.id}`} key={incident.id}>
            <Card className="bg-zinc-950/50 border-zinc-800 hover:border-cyan-500/50 transition-all cursor-pointer group h-full">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-xl font-bold text-zinc-100 group-hover:text-cyan-400 transition-colors">
                  {incident.title}
                </CardTitle>
                <Badge className={`${getSeverityColor(incident.severity)} border-none`}>
                  {incident.severity}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-end mt-4">
                  <div className="text-xs text-muted-foreground font-mono">
                    ID: {incident.id.slice(0, 8)}...
                  </div>
                  <div className="text-xs text-cyan-600 font-mono flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    JOIN CHANNEL →
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
