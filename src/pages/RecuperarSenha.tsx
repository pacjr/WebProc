import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ActusConnectAuthShell } from "@/components/auth/ActusConnectAuthShell";
import { z } from "zod";

const emailSchema = z.object({
  email: z.string().email({ message: "E-mail inválido" }),
});

const RecuperarSenha = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validated = emailSchema.parse({ email });
      setLoading(true);

      const { error } = await supabase.auth.resetPasswordForEmail(validated.email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        toast({
          title: "Erro ao enviar e-mail",
          description: "Não foi possível enviar as instruções. Tente novamente.",
          variant: "destructive",
        });
        return;
      }

      setEmailSent(true);
      toast({
        title: "E-mail enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Erro de validação",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <ActusConnectAuthShell flow="recovery">
        <div className="space-y-6 text-center">
          <p className="text-sm text-muted-foreground">
            Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
          </p>
          <Button variant="legal" onClick={() => navigate("/auth")} className="w-full">
            Voltar ao login
          </Button>
        </div>
      </ActusConnectAuthShell>
    );
  }

  return (
    <ActusConnectAuthShell flow="recovery">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <Button type="submit" variant="legal" className="w-full" disabled={loading}>
          {loading ? "Enviando..." : "Enviar instruções"}
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => navigate("/auth")}
            className="text-sm text-muted-foreground hover:text-foreground transition-smooth"
          >
            ← Voltar ao login
          </button>
        </div>
      </form>
    </ActusConnectAuthShell>
  );
};

export default RecuperarSenha;
