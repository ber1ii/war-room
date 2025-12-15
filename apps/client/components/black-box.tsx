"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ArchiveIcon } from "@radix-ui/react-icons";

type Message = {
  text: string;
  sender: string;
  timestamp: string;
  type?: string;
};

interface BlackBoxProps {
  logs: Message[];
}

export default function BlackBox({ logs }: BlackBoxProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="bg-black/50 border-yellow-900/50 text-yellow-500 hover:bg-yellow-950/30 hover:text-yellow-400"
        >
          <ArchiveIcon className="mr-2 h-4 w-4" />
          BLACK BOX
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[400px] bg-zinc-950 border-l border-yellow-900/30 text-yellow-500 font-mono p-0 flex flex-col"
      >
        <SheetHeader className="p-6 border-b border-yellow-900/30 bg-black/40">
          <SheetTitle className="text-yellow-500 tracking-widest text-xl font-black">
            {"// AUDIT_LOG"}
          </SheetTitle>
          <div className="text-[10px] text-yellow-700">CONFIDENTIAL // SYSTEM EVENTS RECORDING</div>
        </SheetHeader>

        <ScrollArea className="flex-grow p-6">
          <div className="space-y-4">
            {logs.map((log, i) => (
              <div key={i} className="flex flex-col gap-1 border-b border-yellow-900/20 pb-2">
                <div className="flex justify-between items-center text-[10px] text-yellow-700">
                  <span>{log.timestamp}</span>
                  <span>{log.sender === "SYSTEM" ? "SYS_KERNEL" : `USR:${log.sender}`}</span>
                </div>
                <div
                  className={`text-xs ${
                    log.sender === "SYSTEM" ? "text-yellow-400 font-bold" : "text-zinc-500"
                  }`}
                >
                  {log.sender === "SYSTEM" ? "> " : ""}
                  {log.text}
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-center text-yellow-900 italic mt-10">NO RECORDS FOUND</div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
