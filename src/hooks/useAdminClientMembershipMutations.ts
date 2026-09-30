import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminCreateClientMembership,
  adminSetClientMembershipActive,
  adminUpdateClientMembership,
  provisionClientMembership,
} from "@/integrations/supabase/admin-api";
import { adminClientMembershipsQueryKey } from "@/hooks/useAdminClientMembershipsQuery";

export function useAdminClientMembershipMutations(clienteId: number) {
  const queryClient = useQueryClient();

  const invalidateMemberships = async () => {
    await queryClient.invalidateQueries({
      queryKey: adminClientMembershipsQueryKey(clienteId),
    });
  };

  const createAccess = useMutation({
    mutationFn: (input: { email: string; nome: string }) =>
      adminCreateClientMembership({
        clienteId,
        email: input.email,
        nome: input.nome,
      }),
    onSuccess: () => invalidateMemberships(),
  });

  const updateNome = useMutation({
    mutationFn: (input: { membershipId: number; nome: string }) =>
      adminUpdateClientMembership({
        membershipId: input.membershipId,
        nome: input.nome,
      }),
    onSuccess: () => invalidateMemberships(),
  });

  const setAtivo = useMutation({
    mutationFn: (input: { membershipId: number; ativo: boolean }) =>
      adminSetClientMembershipActive({
        membershipId: input.membershipId,
        ativo: input.ativo,
      }),
    onSuccess: () => invalidateMemberships(),
  });

  const provision = useMutation({
    mutationFn: (membershipId: number) => provisionClientMembership(membershipId),
    onSuccess: () => invalidateMemberships(),
  });

  return { createAccess, updateNome, setAtivo, provision };
}
