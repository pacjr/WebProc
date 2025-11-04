import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

interface ClienteData {
  codigo_cliente: number;
  nome_cliente: string;
}

interface ClienteContextType {
  cliente: ClienteData | null;
  user: User | null;
  loading: boolean;
  fetchClienteData: () => Promise<void>;
  clearCliente: () => void;
}

const ClienteContext = createContext<ClienteContextType | undefined>(undefined);

export const ClienteProvider = ({ children }: { children: ReactNode }) => {
  const [cliente, setCliente] = useState<ClienteData | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchClienteData = async () => {
    try {
      setLoading(true);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        setCliente(null);
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);

      const response = await supabase
        .from("clientes" as any)
        .select("codigo_cliente, nome_cliente")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (response.error) {
        console.error("Erro ao buscar dados do cliente:", response.error);
        setLoading(false);
        return;
      }

      if (response.data) {
        const data = response.data as any;
        setCliente({
          codigo_cliente: data.codigo_cliente,
          nome_cliente: data.nome_cliente,
        });
      }
      setLoading(false);
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
      setLoading(false);
    }
  };

  const clearCliente = () => {
    setCliente(null);
    setUser(null);
  };

  useEffect(() => {
    // Initial data fetch
    fetchClienteData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          setUser(session.user);
          // Defer Supabase calls with setTimeout to prevent deadlock
          setTimeout(() => {
            fetchClienteData();
          }, 0);
        } else if (event === "SIGNED_OUT") {
          clearCliente();
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <ClienteContext.Provider
      value={{ cliente, user, loading, fetchClienteData, clearCliente }}
    >
      {children}
    </ClienteContext.Provider>
  );
};

export const useCliente = () => {
  const context = useContext(ClienteContext);
  if (context === undefined) {
    throw new Error("useCliente deve ser usado dentro de ClienteProvider");
  }
  return context;
};
