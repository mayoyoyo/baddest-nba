import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  type ApiError,
  type MeDto,
  type SessionUserDto,
} from "@/lib/api";

interface AuthContextValue {
  user: SessionUserDto | null;
  totalVotesCast: number;
  avatarImageId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setMe: (me: MeDto) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_ME: MeDto = {
  user: null,
  totalVotesCast: 0,
  avatarImageId: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeDto>(EMPTY_ME);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await api.get<MeDto>("/api/me");
      setMe(next);
    } catch (error) {
      // /api/me is intentionally unauthenticated and never returns 401
      // any more, but keep this guard for transient network failures.
      if ((error as ApiError).status !== 401) {
        console.error("auth refresh failed", error);
      }
      setMe(EMPTY_ME);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post("/api/logout");
    } catch {
      /* fire-and-forget */
    }
    setMe(EMPTY_ME);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.user,
      totalVotesCast: me.totalVotesCast,
      avatarImageId: me.avatarImageId,
      loading,
      refresh,
      signOut,
      setMe,
    }),
    [me, loading, refresh, signOut],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
