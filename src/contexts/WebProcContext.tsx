import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveMembership } from "@/integrations/supabase/webproc-api";
import type { WebProcMembership } from "@/integrations/supabase/webproc-types";

interface WebProcContextValue {
  user: User | null;
  membership: WebProcMembership | null;
  loading: boolean;
  refresh: () => Promise<void>;
  clear: () => void;
}

const WebProcContext = createContext<WebProcContextValue | undefined>(undefined);

export function WebProcProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<WebProcMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const clear = useCallback(() => {
    setUser(null);
    setMembership(null);
  }, []);

  const resolveMembership = useCallback(async (userId: string) => {
    const { membership: activeMembership, error } =
      await fetchActiveMembership(userId);

    if (error) {
      console.error("Erro ao resolver membership WebProc:", error);
      setMembership(null);
      return;
    }

    setMembership(activeMembership);
  }, []);

  const refresh = useCallback(
    async (options?: { blockUi?: boolean }) => {
      const shouldBlockUi = options?.blockUi ?? !initializedRef.current;

      if (shouldBlockUi) {
        setLoading(true);
      }

      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!currentUser) {
          clear();
          return;
        }

        setUser(currentUser);
        await resolveMembership(currentUser.id);
      } catch (error) {
        console.error("Erro ao carregar contexto WebProc:", error);
        setMembership(null);
      } finally {
        initializedRef.current = true;
        if (shouldBlockUi) {
          setLoading(false);
        }
      }
    },
    [clear, resolveMembership]
  );

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

      if (event === "SIGNED_IN") {
        setUser(session.user);
        if (initializedRef.current) {
          void resolveMembership(session.user.id);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [clear, refresh, resolveMembership]);

  return (
    <WebProcContext.Provider
      value={{ user, membership, loading, refresh, clear }}
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
