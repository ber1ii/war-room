import { supabase } from "./supabase";

const API_BASE = "http://localhost:4000/api";

async function getHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  return headers;
}

export const api = {
  // 1. GET
  get: async <T>(endpoint: string): Promise<T> => {
    const headers = await getHeaders();
    const res = await fetch(`${API_BASE}${endpoint}`, { headers, cache: "no-store" });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `GET ${endpoint} failed`);
    }

    return res.json();
  },

  // 2. POST
  post: async <TReturn>(endpoint: string, body: unknown): Promise<TReturn> => {
    const headers = await getHeaders();
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `POST ${endpoint} failed`);
    }
    return res.json();
  },

  // 3. PATCH
  patch: async <TReturn>(endpoint: string, body: unknown): Promise<TReturn> => {
    const headers = await getHeaders();
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `PATCH ${endpoint} failed`);
    }
    return res.json();
  },

  // 4. DELETE
  delete: async <TReturn>(endpoint: string): Promise<TReturn> => {
    const headers = await getHeaders();
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "DELETE",
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `DELETE ${endpoint} failed`);
    }
    return res.json();
  },
};
