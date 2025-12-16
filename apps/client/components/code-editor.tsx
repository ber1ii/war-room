"use client";

import { useState, useEffect, useCallback, useRef, act, use } from "react";
import Editor, { OnChange, OnMount } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Socket } from "socket.io-client";
import { api } from "@/lib/api";
import { GitHubLogoIcon, TrashIcon } from "@radix-ui/react-icons";

type Snippet = {
  id: string;
  title: string;
  language: string;
  code: string;
  lockedBy: string | null;
};

interface CodeEditorProps {
  incidentId: string;
  username: string;
  socket: Socket | null;
  className?: string;
}

export default function CodeEditor({ incidentId, username, socket, className }: CodeEditorProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [activeSnippet, setActiveSnippet] = useState<Snippet | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const debouncedEditorValue = useDebounce(editorValue, 1000);

  const activeSnippetRef = useRef<Snippet | null>(null);

  useEffect(() => {
    activeSnippetRef.current = activeSnippet;
  }, [activeSnippet]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      checkJs: true,
      allowJs: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      strict: true,
    });
  };

  const detectLanguage = (filename: string) => {
    if (!filename) return "javascript";
    const lower = filename.toLowerCase();

    if (lower.endsWith(".cpp") || lower.endsWith(".h") || lower.endsWith(".hpp")) return "cpp";
    if (lower.endsWith(".py")) return "python";
    if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
    if (lower.endsWith(".html")) return "html";
    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".css")) return "css";
    return "javascript";
  };

  const fetchSnippets = useCallback(async () => {
    if (!incidentId) return;
    try {
      const data = await api.get<Snippet[]>(`/incidents/${incidentId}/snippets`);
      setSnippets(data);

      const currentActive = activeSnippetRef.current;

      if (currentActive) {
        const updated = data.find((s: Snippet) => s.id === currentActive.id);
        if (updated) {
          setActiveSnippet(updated);
          // Only update editor text if we are NOT the one editing
          if (updated.lockedBy !== username) {
            setEditorValue(updated.code);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch snippets:", error);
    }
  }, [incidentId, username]);

  const fetchSnippetsRef = useRef(fetchSnippets);

  useEffect(() => {
    fetchSnippetsRef.current = fetchSnippets;
  }, [fetchSnippets]);

  useEffect(() => {
    if (incidentId) {
      fetchSnippetsRef.current();
    }
  }, [incidentId, username]);

  useEffect(() => {
    if (!socket) return;

    const handleSocketUpdate = () => {
      fetchSnippetsRef.current();
    };

    const handleLiveUpdate = (data: { snippetId: string; code: string }) => {
      const current = activeSnippetRef.current;

      if (current?.id === data.snippetId) {
        setEditorValue(data.code);
      }
    };

    const handleRefresh = () => fetchSnippetsRef.current;

    socket.on("snippet_created", handleSocketUpdate);
    socket.on("snippet_locked", handleSocketUpdate);
    socket.on("snippet_unlocked", handleSocketUpdate);
    socket.on("snippet_update", handleLiveUpdate);
    socket.on("snippet_deleted", handleRefresh);

    return () => {
      socket.off("snippet_created", handleSocketUpdate);
      socket.off("snippet_locked", handleSocketUpdate);
      socket.off("snippet_unlocked", handleSocketUpdate);
      socket.off("snippet_update", handleLiveUpdate);
      socket.off("snippet_deleted", handleRefresh);
    };
  }, [socket, username]);

  // Auto-Save Effect
  useEffect(() => {
    // Guard clauses
    // - Must have active snippet
    // - Must be locked bt ME
    // - Debounced value must exist
    if (!activeSnippet || activeSnippet.lockedBy !== username) return;

    // Prevent "Ghost Saves" on initial load
    if (debouncedEditorValue === activeSnippet.code) return;

    const autoSave = async () => {
      setIsSaving(true);
      try {
        await api.patch(`/snippets/${activeSnippet.id}`, {
          code: debouncedEditorValue,
        });

        setActiveSnippet((prev) => (prev ? { ...prev, code: debouncedEditorValue } : null));

        setSnippets((prev) =>
          prev.map((s) => (s.id === activeSnippet.id ? { ...s, code: debouncedEditorValue } : s)),
        );
      } catch (e) {
        console.error("Auto-Save failed", e);
      } finally {
        setTimeout(() => setIsSaving(false), 500);
      }
    };

    autoSave();
  }, [debouncedEditorValue, activeSnippet, username]);

  const handleCreate = async () => {
    if (!newFileName) return;
    try {
      await api.post("/snippets", {
        incidentId,
        title: newFileName,
        language: "javascript",
        code: "// " + newFileName + " initialized...",
      });
      socket?.emit("create_snippet", { roomId: incidentId });
      setNewFileName("");
      setIsCreating(false);
    } catch (e) {
      console.error("Create failed", e);
    }
  };

  const handleLock = () => {
    if (!activeSnippet || !socket) return;
    socket.emit("lock_snippet", { snippetId: activeSnippet.id, roomId: incidentId, username });
  };

  const handleSave = () => {
    if (!activeSnippet || !socket) return;
    socket.emit("unlock_snippet", {
      snippetId: activeSnippet.id,
      roomId: incidentId,
      code: editorValue,
    });
  };

  const handleDelete = async () => {
    if (!activeSnippet) return;

    if (activeSnippet.lockedBy && activeSnippet.lockedBy !== username) {
      alert("CANNOT DELETE: File is locked by another operative.");
      return;
    }

    const confirm = window.confirm(`WARNING: PERMANENTLY DELETE ${activeSnippet.title}`);
    if (!confirm) return;

    try {
      await api.delete(`/snippets/${activeSnippet.id}`);

      socket?.emit("delete_snippet", { roomId: incidentId });

      setSnippets((prev) => prev.filter((s) => s.id !== activeSnippet.id));
      setActiveSnippet(null);
      setEditorValue("");
    } catch (e) {
      console.error("Delete failed", e);
      alert("DELETE FAILED");
    }
  };

  const handleCancel = () => {
    if (!activeSnippet || !socket) return;

    socket.emit("unlock_snippet", { snippetId: activeSnippet.id, roomId: incidentId });
    fetchSnippetsRef.current();
  };

  const handleEditorChange: OnChange = (value) => {
    const newVal = value || "";
    setEditorValue(newVal);

    if (activeSnippet && activeSnippet.lockedBy === username && socket) {
      socket.emit("snippet_live_change", {
        roomId: incidentId,
        snippetId: activeSnippet.id,
        code: newVal,
      });
    }
  };

  const handlePushToGithub = async () => {
    if (!activeSnippet) return;

    setIsPushing(true);
    try {
      await api.post("/integrations/github/push", {
        filename: activeSnippet.title,
        content: editorValue,
        commitMessage: `Update ${activeSnippet.title} from Incident ${incidentId}`,
      });
      alert("ARCHIVED TO GITHUB SUCCESFULLY");
    } catch (e) {
      console.error(e);
      alert("GITHUB PUSH FAILED");
    } finally {
      setIsPushing(false);
    }
  };

  const isLockedByMe = activeSnippet?.lockedBy === username;
  const isLockedByOther = activeSnippet?.lockedBy && activeSnippet.lockedBy !== username;
  const currentLanguage = activeSnippet ? detectLanguage(activeSnippet.title) : "javascript";

  return (
    <Card className={`bg-black/40 border-purple-900/50 flex flex-col ${className || "h-[600px]"}`}>
      <CardHeader className="border-b border-purple-900/30 py-3 flex flex-row justify-between items-center shrink-0">
        <CardTitle className="text-sm font-mono text-purple-400">REMOTE_EXEC // SNIPPETS</CardTitle>
        <div className="flex gap-2">
          {isCreating ? (
            <div className="flex gap-2">
              <input
                className="bg-black border border-purple-500 text-xs px-2 py-1 text-white"
                placeholder="filename.js"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
              />
              <Button size="sm" onClick={handleCreate} className="h-6 text-xs bg-green-600">
                OK
              </Button>
              <Button
                size="sm"
                onClick={() => setIsCreating(false)}
                className="h-6 text-xs bg-red-600"
              >
                X
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCreating(true)}
              className="h-6 text-xs border-purple-500 text-purple-400"
            >
              + NEW FILE
            </Button>
          )}
        </div>
      </CardHeader>

      <div className="flex flex-grow overflow-hidden">
        {/* SIDEBAR */}
        <div className="w-48 border-r border-purple-900/30 bg-black/20 overflow-y-auto">
          {snippets.map((file) => (
            <div
              key={file.id}
              onClick={() => {
                setActiveSnippet(file);
                setEditorValue(file.code);
              }}
              className={`p-3 text-xs font-mono cursor-pointer border-l-2 hover:bg-white/5 flex justify-between items-center
                ${
                  activeSnippet?.id === file.id
                    ? "border-purple-500 bg-white/5 text-cyan-400"
                    : "border-transparent text-gray-400"
                }
              `}
            >
              <span>{file.title}</span>
              {file.lockedBy && <span className="text-[10px] text-red-500">🔒</span>}
            </div>
          ))}
        </div>

        {/* EDITOR AREA */}
        <div className="flex-grow flex flex-col bg-[#1e1e1e]">
          {activeSnippet ? (
            <>
              {/* TOOLBAR */}
              <div className="h-10 bg-[#252526] flex items-center justify-between px-4 border-b border-black shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 font-mono">{activeSnippet.title}</span>
                  {isLockedByOther && (
                    <Badge variant="destructive" className="text-[10px] h-5">
                      LOCKED BY {activeSnippet.lockedBy}
                    </Badge>
                  )}
                  {isLockedByMe && (
                    <Badge className="bg-green-600 text-[10px] h-5">EDITING...</Badge>
                  )}
                  {isLockedByMe && (
                    <span
                      className={`text-[10px] font-mono transition-colors ${
                        isSaving ? "text-yellow-400" : "text-gray-600"
                      }`}
                    >
                      {isSaving ? "SAVING..." : "ALL CHANGES SAVED"}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!activeSnippet.lockedBy && (
                    <Button
                      size="sm"
                      onClick={handleLock}
                      className="h-6 text-xs bg-cyan-700 hover:bg-cyan-600"
                    >
                      EDIT FILE
                    </Button>
                  )}

                  {(!activeSnippet.lockedBy || isLockedByMe) && (
                    <Button
                      size="sm"
                      onClick={handlePushToGithub}
                      disabled={isPushing}
                      className="h-6 text-xs bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 flex items-center gap-2"
                    >
                      <GitHubLogoIcon className="h-3 w-3 text-orange-500" />

                      {isPushing ? "PUSHING..." : "GIT PUSH"}
                    </Button>
                  )}

                  {(!activeSnippet.lockedBy || isLockedByMe) && (
                    <Button
                      size="sm"
                      onClick={handleDelete}
                      className="h-6 w-6 p-0 bg-red-950/30 hover:bg-red-600 border border-red-900/50 text-red-500 hover:text-white transition-colors"
                      title="Delete File"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {isLockedByMe && (
                    <>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        className="h-6 text-xs bg-green-600 hover:bg-green-500"
                      >
                        SAVE
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCancel}
                        className="h-6 text-xs bg-gray-600 hover:bg-gray-500"
                      >
                        CANCEL
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* MONACO */}
              <div className="flex-grow relative">
                {isLockedByOther && (
                  <div className="absolute inset-0 z-10 bg-black/10 cursor-not-allowed" />
                )}
                <Editor
                  height="100%"
                  language={currentLanguage}
                  value={editorValue}
                  theme="vs-dark"
                  onMount={handleEditorDidMount}
                  onChange={handleEditorChange}
                  options={{
                    readOnly: !isLockedByMe,
                    minimap: { enabled: false },
                    fontSize: 12,
                    fontFamily: "monospace",
                    quickSuggestions: true,
                    renderValidationDecorations: "on",
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 font-mono text-sm">
              SELECT A FILE TO VIEW
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
