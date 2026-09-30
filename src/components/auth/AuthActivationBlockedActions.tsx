import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AuthBackToAccess } from "@/components/auth/AuthBackToAccess";

/** Actions when /auth/activate is accessed without a valid invitation context. */
export function AuthActivationBlockedActions() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <Button type="button" variant="legal" className="w-full" onClick={() => navigate("/auth")}>
        Ir para o login
      </Button>
      <div className="text-center">
        <AuthBackToAccess variant="link" />
      </div>
    </div>
  );
}
