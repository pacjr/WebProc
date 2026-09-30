import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearAccountActivationGrant,
  hasAccountActivationGrant,
  hashIndicatesInvite,
  markAccountActivationGrant,
  searchParamsIndicateInvite,
} from "@/lib/auth/account-activation-grant";
import { hashIndicatesRecovery } from "@/lib/auth/password-recovery-grant";

export type AccountActivationGatePhase =
  | "bootstrapping"
  | "activation_valid"
  | "activation_invalid";

/**
 * Authorizes /auth/activate only after a validated invite context (hash/query
 * type=invite|signup or OTP verify), not a normal persisted session alone.
 */
export function useAccountActivationGate() {
  const [phase, setPhase] = useState<AccountActivationGatePhase>("bootstrapping");
  const authorizedRef = useRef(false);

  const invalidateActivation = () => {
    clearAccountActivationGrant();
    authorizedRef.current = false;
    setPhase("activation_invalid");
  };

  useEffect(() => {
    let cancelled = false;

    const authorize = () => {
      if (cancelled || authorizedRef.current) return;
      authorizedRef.current = true;
      markAccountActivationGrant();
      setPhase("activation_valid");
    };

    const reject = () => {
      if (cancelled || authorizedRef.current) return;
      clearAccountActivationGrant();
      setPhase("activation_invalid");
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
        if (hasAccountActivationGrant()) {
          authorize();
        }
      }
    });

    const bootstrap = async () => {
      if (hashIndicatesRecovery()) {
        reject();
        return;
      }

      if (hashIndicatesInvite()) {
        markAccountActivationGrant();
      }

      const otpInvite = searchParamsIndicateInvite();
      if (otpInvite) {
        markAccountActivationGrant();
        const params = new URLSearchParams(window.location.search);
        const otpType = params.get("type") === "signup" ? "signup" : "invite";
        const { error } = await supabase.auth.verifyOtp({
          token_hash: otpInvite.tokenHash,
          type: otpType,
        });
        if (error) {
          reject();
          return;
        }
      }

      await supabase.auth.getSession();

      if (cancelled || authorizedRef.current) {
        return;
      }

      await new Promise<void>((resolve) => {
        queueMicrotask(() => resolve());
      });

      if (cancelled || authorizedRef.current) {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (hasAccountActivationGrant() && session) {
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

  return { phase, invalidateActivation };
}
