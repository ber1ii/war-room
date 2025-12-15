"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

// List of public paths that don't need login
const publicPaths = ["/login", "/register"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // 1. Run the check on mount
    const checkAuth = async () => {
      // If we are already on a public page, we don't need to check auth
      if (publicPaths.includes(pathname)) {
        setAuthorized(true);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // No user? Kick them to login
        router.push("/login");
      } else {
        // User exists? Let them see the page
        setAuthorized(true);
      }
    };

    checkAuth();

    // 2. Set up a listener for auth changes (e.g. user clicks logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setAuthorized(false);
        router.push("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, pathname]);

  // If we are checking, show nothing (or a loading spinner)
  // This prevents the "Flash of Unauthenticated Content"
  if (!authorized) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[var(--background)] text-cyan-500 font-mono animate-pulse">
        VERIFYING BIOMETRICS...
      </div>
    );
  }

  // If authorized, render the actual page
  return <>{children}</>;
}
