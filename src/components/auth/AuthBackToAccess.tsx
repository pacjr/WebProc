import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

type AuthBackToAccessProps =
  | { variant: "link" }
  | { variant: "button"; className?: string };

/** Shared navigation back to /auth within the Connect auth family. */
export function AuthBackToAccess(props: AuthBackToAccessProps) {
  const navigate = useNavigate();

  if (props.variant === "button") {
    return (
      <Button
        type="button"
        variant="legal"
        onClick={() => navigate("/auth")}
        className={props.className ?? "w-full"}
      >
        Voltar ao acesso
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate("/auth")}
      className="text-sm text-muted-foreground hover:text-foreground transition-smooth"
    >
      ← Voltar ao acesso
    </button>
  );
}
