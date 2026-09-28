import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearPasswordRecoveryGrant,
  hasPasswordRecoveryGrant,
  hashIndicatesRecovery,
  markPasswordRecoveryGrant,
} from "@/lib/auth/password-recovery-grant";

export type PasswordRecoveryGatePhase =
  | "bootstrapping"
  | "recovery_valid"
  | "recovery_invalid";

/**
 * Authorizes /nova-senha only after PASSWORD_RECOVERY or an explicit recovery
 * grant (hash type=recovery or tab-scoped sessionStorage set by recovery).
 * A normal persisted Supabase session alone is not sufficient.
 */
export function usePasswordRecoveryGate() {
  const [phase, setPhase] = useState<PasswordRecoveryGatePhase>("bootstrapping");
  const recoveryAuthorizedRef = useRef(false);

  const invalidateRecovery = () => {
    clearPasswordRecoveryGrant();
    recoveryAuthorizedRef.current = false;
    setPhase("recovery_invalid");
  };

  useEffect(() => {
    let cancelled = false;

    if (hashIndicatesRecovery()) {
      markPasswordRecoveryGrant();
    }

    const authorize = () => {
      if (cancelled || recoveryAuthorizedRef.current) return;
      recoveryAuthorizedRef.current = true;
      markPasswordRecoveryGrant();
      setPhase("recovery_valid");
    };

    const reject = () => {
      if (cancelled || recoveryAuthorizedRef.current) return;
      clearPasswordRecoveryGrant();
      setPhase("recovery_invalid");
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        authorize();
      }
    });

    const bootstrap = async () => {
      await supabase.auth.getSession();

      if (cancelled || recoveryAuthorizedRef.current) {
        return;
      }

      // Allow PASSWORD_RECOVERY (and other auth events) to run after URL detection.
      await new Promise<void>((resolve) => {
        queueMicrotask(() => resolve());
      });

      if (cancelled || recoveryAuthorizedRef.current) {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (hasPasswordRecoveryGrant() && session) {
        authorize();
        return;
      }

      reject();
    };

    void bootstrap();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { phase, invalidateRecovery };
}
