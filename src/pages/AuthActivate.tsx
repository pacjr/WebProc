import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { ActusConnectAuthShell } from "@/components/auth/ActusConnectAuthShell";
import { AuthActivationBlockedActions } from "@/components/auth/AuthActivationBlockedActions";
import { useAccountActivationGate } from "@/hooks/useAccountActivationGate";
import {
  canEnterProtectedApp,
  resolveConnectAccess,
} from "@/lib/connect-access";
import {
  clearAccountActivationGrant,
  hasAccountActivationGrant,
} from "@/lib/auth/account-activation-grant";

type UiPhase = "submitting" | "no_connect_access" | null;

const AuthActivate = () => {
  const { phase: gatePhase, invalidateActivation } = useAccountActivationGate();
  const [uiPhase, setUiPhase] = useState<UiPhase>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const getPasswordStrength = (pass: string) => {
    if (pass.length === 0) return { level: 0, text: "", color: "" };
    if (pass.length < 6) return { level: 1, text: "Fraca", color: "text-destructive" };
    if (pass.length < 10) return { level: 2, text: "Média", color: "text-yellow-600" };

    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[^A-Za-z0-9]/.test(pass);
    const strength = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

    if (strength >= 3 && pass.length >= 10) {
      return { level: 3, text: "Forte", color: "text-green-600" };
    }
    return { level: 2, text: "Média", color: "text-yellow-600" };
  };

  const passwordStrength = getPasswordStrength(password);
  const submitting = uiPhase === "submitting";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (gatePhase !== "activation_valid" || submitting) {
      return;
    }

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (passwordStrength.level < 2) {
      toast.error("A senha deve ter pelo menos 10 caracteres");
      return;
    }

    if (!hasAccountActivationGrant()) {
      invalidateActivation();
      return;
    }

    setUiPhase("submitting");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        invalidateActivation();
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error("Não foi possível concluir a ativação. Tente novamente.");
        setUiPhase(null);
        return;
      }

      await supabase.auth.getSession();
      clearAccountActivationGrant();

      const { access } = await resolveConnectAccess();

      if (!canEnterProtectedApp(access)) {
        setUiPhase("no_connect_access");
        return;
      }

      toast.success("Acesso ativado com sucesso");
      navigate("/app/processos", { replace: true });
    } catch {
      toast.error("Não foi possível concluir a ativação. Tente novamente.");
      setUiPhase(null);
    }
  };

  const handleSignOutFromNoAccess = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  if (uiPhase === "no_connect_access") {
    return (
      <ActusConnectAuthShell flow="activationNoAccess">
        <p className="text-sm text-muted-foreground mb-6">
          Seu acesso foi autenticado, mas não há um acesso ativo ao Connect associado a esta conta.
        </p>
        <Button type="button" variant="legal" className="w-full" onClick={handleSignOutFromNoAccess}>
          Voltar ao login
        </Button>
      </ActusConnectAuthShell>
    );
  }

  if (gatePhase === "bootstrapping") {
    return (
      <ActusConnectAuthShell flow="activation">
        <p className="text-center text-sm text-muted-foreground" aria-busy="true">
          Validando convite...
        </p>
      </ActusConnectAuthShell>
    );
  }

  if (gatePhase === "activation_invalid") {
    return (
      <ActusConnectAuthShell flow="activationInvalid">
        <AuthActivationBlockedActions />
      </ActusConnectAuthShell>
    );
  }

  return (
    <ActusConnectAuthShell flow="activation">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
              autoComplete="new-password"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-smooth ${
                    passwordStrength.level === 1
                      ? "w-1/3 bg-destructive"
                      : passwordStrength.level === 2
                        ? "w-2/3 bg-yellow-600"
                        : "w-full bg-green-600"
                  }`}
                />
              </div>
              <span className={`text-sm font-medium ${passwordStrength.color}`}>
                {passwordStrength.text}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar senha</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="pr-10"
              autoComplete="new-password"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={showConfirmPassword ? "Ocultar confirmação" : "Mostrar confirmação"}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPassword && (
            <div className="flex items-center gap-2 mt-2">
              {password === confirmPassword ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-600">Senhas coincidem</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">Senhas não coincidem</span>
                </>
              )}
            </div>
          )}
        </div>

        <Button type="submit" variant="legal" className="w-full" disabled={submitting}>
          {submitting ? "Ativando..." : "Ativar acesso"}
        </Button>
      </form>
    </ActusConnectAuthShell>
  );
};

export default AuthActivate;
