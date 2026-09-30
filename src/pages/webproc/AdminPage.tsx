import { AdminClientesSection } from "@/components/admin/AdminClientesSection";

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary">
          Administração
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Gerencie o acesso e a estrutura de clientes do Connect.
        </p>
      </header>

      <AdminClientesSection />
    </div>
  );
}
