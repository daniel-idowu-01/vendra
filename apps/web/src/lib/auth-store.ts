import { create } from "zustand";
import { persist } from "zustand/middleware";

type AuthState = {
  accessToken?: string;
  organizationId?: string;
  setSession: (session: { accessToken: string; organizationId?: string }) => void;
  updateAccessToken: (session: { accessToken: string; organizationId?: string }) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      setSession: (session) => set(session),
      updateAccessToken: (session) =>
        set((state) => ({
          accessToken: session.accessToken,
          organizationId: session.organizationId ?? state.organizationId
        })),
      clear: () => set({ accessToken: undefined, organizationId: undefined })
    }),
    { name: "vendra.auth" }
  )
);
