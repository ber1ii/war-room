"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-purple-900/50 bg-black/40 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl text-center text-cyan-400 font-bold tracking-widest">
            WAR ROOM ACCESS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-purple-300">Operative Email</label>
              <Input
                type="email"
                placeholder="agent@warroom.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-purple-900/50 bg-black/50 text-cyan-100"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-purple-300">Passcode</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-purple-900/50 bg-black/50 text-cyan-100"
                required
              />
            </div>

            {error && (
              <div className="text-red-500 text-sm text-center bg-red-950/20 p-2 rounded border border-red-900">
                ⚠ {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-black font-bold"
              disabled={loading}
            >
              {loading ? "AUTHENTICATING..." : "INITIATE UPLINK"}
            </Button>

            <div className="text-center text-sm text-muted-foreground mt-4">
              Need clearance?{" "}
              <Link href="/register" className="text-purple-400 hover:text-purple-300 underline">
                Request Access
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
