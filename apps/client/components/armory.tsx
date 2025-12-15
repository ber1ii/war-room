"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LockOpen1Icon, EyeOpenIcon, StopwatchIcon, LockClosedIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/api";
import { Socket } from "socket.io-client";

type Secret = {
  id: string;
  label: string;
  value: string;
  expiresAt: string;
};

export default function Armory({
  incidentId,
  socket,
}: {
  incidentId: string;
  socket: Socket | null;
}) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!incidentId) return;

    const load = async () => {
      try {
        const data = await api.get<Secret[]>(`/incidents/${incidentId}/secrets`);
        setSecrets(data);
      } catch (e) {}
    };
    load();

    if (!socket) return;
    socket.on("secret_added", (s: Secret) => {
      setSecrets((prev) => [...prev, { ...s, value: "****************" }]);
    });

    return () => {
      socket.off("secret_added");
    };
  }, [incidentId, socket]);

  const handleDeposit = async () => {
    if (!label || !value) return;

    try {
      await api.post("/secrets", { incidentId, label, value });
      setLabel("");
      setValue("");
      setIsOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReveal = async (id: string) => {
    if (!confirm("REVEALING THIS SECRET WILL LOG YOUR IDENTITY. PROCEED?")) return;
    try {
      const res = await api.post<{ value: string }>(`/secrets/${id}/reveal`, {});
      setSecrets((prev) => prev.map((s) => (s.id === id ? { ...s, value: res.value } : s)));
    } catch (e) {
      alert("SECRET EXPIRED");
    }
  };

  return (
    <div className="flex flex-col gap-2 p-4 bg-black/40 border border-orange-900/30 rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-orange-500 font-mono text-xs tracking-widest flex items-center gap-2">
          <LockClosedIcon /> THE_ARMORY
        </h3>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] border-orange-800 text-orange-500 hover:bg-orange-900/20"
            >
              + DEPOSIT
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-950 border-orange-900">
            <DialogHeader>
              <DialogTitle className="text-orange-500 font-mono">SECURE DEPOSIT</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-4">
              <Input
                placeholder="Asset Label (e.g. AWS Root)"
                className="bg-black border-orange-900 text-orange-100"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Input
                placeholder="Secret Value"
                type="password"
                className="bg-black border-orange-900 text-orange-100"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <div className="text-[10px] text-orange-700 font-mono flex items-center gap-2">
                <StopwatchIcon className="h-3 w-3" />⚠ ASSET WILL SELF-DESTRUCT IN 5 MINUTES
              </div>
              <Button onClick={handleDeposit} className="w-full bg-orange-700 hover:bg-orange-600">
                CONFIRM UPLOAD
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
        {secrets.map((s) => (
          <div
            key={s.id}
            className="bg-orange-950/10 border border-orange-900/30 p-2 rounded flex justify-between items-center group"
          >
            <div className="overflow-hidden">
              <div className="text-[10px] text-orange-400 font-bold">{s.label}</div>
              <div className="text-[10px] text-orange-700 font-mono truncate max-w-[120px]">
                {s.value}
              </div>
            </div>
            {s.value.includes("*") ? (
              <Button
                onClick={() => handleReveal(s.id)}
                size="sm"
                className="h-6 w-6 p-0 bg-transparent hover:bg-orange-900/50 text-orange-500 border border-orange-900/50"
                title="Decrypt Asset"
              >
                <LockOpen1Icon className="h-3 w-3" />
              </Button>
            ) : (
              <div className="text-[10px] text-green-500 font-mono animate-pulse">REVEALED</div>
            )}
          </div>
        ))}
        {secrets.length === 0 && (
          <div className="text-[10px] text-orange-900 italic text-center">VAULT EMPTY</div>
        )}
      </div>
    </div>
  );
}
