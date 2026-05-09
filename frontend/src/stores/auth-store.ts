import { create } from "zustand";
import type { User } from "@/lib/types";

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  authRequired: boolean | null; // null = not yet checked

  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  setAuthRequired: (required: boolean) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  authRequired: null,

  setAuth: (user, token) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ost_token", token);
      localStorage.setItem("ost_user", JSON.stringify(user));
    }
    set({ user, token, isAuthenticated: true });
  },

  clearAuth: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ost_token");
      localStorage.removeItem("ost_user");
    }
    set({ user: null, token: null, isAuthenticated: false });
  },

  setAuthRequired: (required) => {
    set({ authRequired: required });
  },

  hydrate: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("ost_token");
    const userStr = localStorage.getItem("ost_user");
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        set({ user, token, isAuthenticated: true });
      } catch {
        set({ user: null, token: null, isAuthenticated: false });
      }
    }
  },
}));
