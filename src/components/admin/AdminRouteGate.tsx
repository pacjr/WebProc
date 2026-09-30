import { useWebProc } from "@/contexts/WebProcContext";
import { useActusAdminCapabilityQuery } from "@/hooks/useActusAdminCapabilityQuery";
import { AdminAreaDenied } from "@/components/admin/AdminAreaDenied";
import AdminPage from "@/pages/webproc/AdminPage";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminRouteGate() {
  const { user, connectAccess } = useWebProc();
  const capabilityQuery = useActusAdminCapabilityQuery(connectAccess, user?.id);

  if (connectAccess.kind !== "ACTUS") {
    return <AdminAreaDenied />;
  }

  if (capabilityQuery.isLoading || capabilityQuery.isFetching) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <p className="text-sm text-muted-foreground">Verificando permissões…</p>
      </div>
    );
  }

  if (capabilityQuery.isError || capabilityQuery.data !== true) {
    return <AdminAreaDenied />;
  }

  return <AdminPage />;
}
