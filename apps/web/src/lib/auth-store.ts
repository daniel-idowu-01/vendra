import { create } from "zustand";

type AuthState = {
  accessToken?: string;
  organizationId?: string;
  setSession: (session: { accessToken: string; organizationId?: string }) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  setSession: (session) => set(session),
  clear: () => set({ accessToken: undefined, organizationId: undefined })
}));
