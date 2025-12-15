"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMsg("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username,
        },
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setMsg("Clearance granted. Please check your email to verify your account.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-cyan-900/50 bg-black/40 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl text-center text-purple-400 font-bold tracking-widest">
            NEW OPERATIVE REGISTRATION
          </CardTitle>
        </CardHeader>
        <CardContent>
          {msg ? (
            <div className="text-center space-y-4">
              <div className="text-green-400 border border-green-900 bg-green-950/30 p-4 rounded">
                {msg}
              </div>
              <Button onClick={() => router.push("/login")} className="w-full">
                Proceed to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-cyan-300">Codename (Username)</label>
                <Input
                  type="text"
                  placeholder="e.g. j0hnny_s1lv3rhand"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="border-cyan-900/50 bg-black/50 text-purple-100"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-cyan-300">Operative Email</label>
                <Input
                  type="email"
                  placeholder="agent@warroom.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-cyan-900/50 bg-black/50 text-purple-100"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-cyan-300">Set Passcode</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-cyan-900/50 bg-black/50 text-purple-100"
                  required
                />
              </div>

              {error && <div className="text-red-500 text-sm">{error}</div>}

              <Button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold"
                disabled={loading}
              >
                {loading ? "PROCESSING..." : "SUBMIT REQUEST"}
              </Button>

              <div className="text-center text-sm text-muted-foreground mt-4">
                Already have clearance?{" "}
                <Link href="/login" className="text-cyan-400 hover:text-cyan-300 underline">
                  Login
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
