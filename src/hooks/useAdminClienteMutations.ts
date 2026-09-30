import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminCreateCliente,
  adminUpdateCliente,
} from "@/integrations/supabase/admin-api";
import { adminClientesQueryKey } from "@/hooks/useAdminClientesQuery";

export function useAdminClienteMutations() {
  const queryClient = useQueryClient();

  const invalidateClientes = async () => {
    await queryClient.invalidateQueries({ queryKey: adminClientesQueryKey });
  };

  const createCliente = useMutation({
    mutationFn: (input: { codigoCliente: number; nome: string }) =>
      adminCreateCliente(input.codigoCliente, input.nome),
    onSuccess: () => invalidateClientes(),
  });

  const updateNome = useMutation({
    mutationFn: (input: { clienteId: number; nome: string }) =>
      adminUpdateCliente({ clienteId: input.clienteId, nome: input.nome }),
    onSuccess: () => invalidateClientes(),
  });

  const setAtivo = useMutation({
    mutationFn: (input: { clienteId: number; ativo: boolean }) =>
      adminUpdateCliente({ clienteId: input.clienteId, ativo: input.ativo }),
    onSuccess: () => invalidateClientes(),
  });

  return { createCliente, updateNome, setAtivo };
}
