import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AuthBackToAccess } from "@/components/auth/AuthBackToAccess";

/** Primary/secondary actions when /nova-senha is accessed without recovery context. */
export function AuthRecoveryBlockedActions() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="legal"
        className="w-full"
        onClick={() => navigate("/recuperar-senha")}
      >
        Solicitar nova senha
      </Button>
      <div className="text-center">
        <AuthBackToAccess variant="link" />
      </div>
    </div>
  );
}
