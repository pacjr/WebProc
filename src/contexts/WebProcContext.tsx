import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  type ConnectAccess,
  getClientMembership,
  resolveConnectAccess,
} from "@/lib/connect-access";
import type { WebProcMembership } from "@/integrations/supabase/webproc-types";

interface WebProcContextValue {
  user: User | null;
  connectAccess: ConnectAccess;
  membership: WebProcMembership | null;
  loading: boolean;
  refresh: (options?: { blockUi?: boolean }) => Promise<void>;
  clear: () => void;
}

const WebProcContext = createContext<WebProcContextValue | undefined>(undefined);

const initialAccess: ConnectAccess = { kind: "AUTHENTICATION_REQUIRED" };

export function WebProcProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [connectAccess, setConnectAccess] = useState<ConnectAccess>(initialAccess);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const membership = useMemo(
    () => getClientMembership(connectAccess),
    [connectAccess],
  );

  const clear = useCallback(() => {
    setUser(null);
    setConnectAccess({ kind: "AUTHENTICATION_REQUIRED" });
  }, []);

  const refresh = useCallback(async (options?: { blockUi?: boolean }) => {
    const shouldBlockUi = options?.blockUi ?? !initializedRef.current;

    if (shouldBlockUi) {
      setLoading(true);
    }

    try {
      const resolved = await resolveConnectAccess();

      if (!resolved.user) {
        clear();
        return;
      }

      setUser(resolved.user);
      setConnectAccess(resolved.access);
    } catch (error) {
      console.error("Erro ao carregar contexto Connect:", error);
      setConnectAccess({ kind: "UNAUTHORIZED" });
    } finally {
      initializedRef.current = true;
      if (shouldBlockUi) {
        setLoading(false);
      }
    }
  }, [clear]);

  useEffect(() => {
    void refresh({ blockUi: true });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clear();
        setLoading(false);
        initializedRef.current = false;
        return;
      }

      if (!session?.user) {
        return;
      }

      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setUser(session.user);
        return;
      }

      if (event === "SIGNED_IN" && initializedRef.current) {
        void refresh({ blockUi: false });
      }
    });

    return () => subscription.unsubscribe();
  }, [clear, refresh]);

  return (
    <WebProcContext.Provider
      value={{ user, connectAccess, membership, loading, refresh, clear }}
    >
      {children}
    </WebProcContext.Provider>
  );
}

export function useWebProc() {
  const context = useContext(WebProcContext);
  if (!context) {
    throw new Error("useWebProc deve ser usado dentro de WebProcProvider");
  }
  return context;
}
