import { create } from "zustand";
import { persist } from "zustand/middleware";

type AuthState = {
  accessToken?: string;
  refreshToken?: string;
  organizationId?: string;
  setSession: (session: { accessToken: string; refreshToken?: string; organizationId?: string }) => void;
  updateAccessToken: (session: { accessToken: string; refreshToken?: string; organizationId?: string }) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      setSession: (session) => set(session),
      updateAccessToken: (session) =>
        set((state) => ({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken ?? state.refreshToken,
          organizationId: session.organizationId ?? state.organizationId
        })),
      clear: () => set({ accessToken: undefined, refreshToken: undefined, organizationId: undefined })
    }),
    { name: "vendra.auth" }
  )
);
