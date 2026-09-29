import { useEffect, useState } from "react";
import { CalendarIcon, Filter, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { PulsePeriodPreset } from "@/hooks/usePulseFilters";
import {
  formatPeriodRangeLabel,
  pulseTimezoneParenthetical,
} from "@/lib/pulse-dates";
import {
  PROCESSO_STATUS_LABELS,
  PROCESSO_STATUS_ORDER,
} from "@/lib/webproc-status-labels";
import type { ProcessoStatus } from "@/integrations/supabase/webproc-types";
import { webprocDb } from "@/integrations/supabase/webproc-client";

const ALL_USERS_VALUE = "__all__";
const ALL_CLIENTS_VALUE = "__all__";

export interface PulseUserOption {
  userId: string;
  label: string;
}

export interface PulseClientOption {
  id: number;
  nome: string;
}

export interface PulseFiltersProps {
  isActus: boolean;
  draft: {
    preset: PulsePeriodPreset;
    periodStart: string;
    periodEnd: string;
    clienteId: number | null;
    createdBy: string | null;
    statuses: ProcessoStatus[];
  };
  applyError: string | null;
  isApplying: boolean;
  clientMembershipClienteId?: number;
  onPreset: (preset: PulsePeriodPreset) => void;
  onPeriodRange: (start: string, end: string) => void;
  onClienteId: (id: number | null) => void;
  onCreatedBy: (id: string | null) => void;
  onToggleStatus: (status: ProcessoStatus) => void;
  onClearStatuses: () => void;
  onApply: () => void;
}

function presetButtonClass(active: boolean) {
  return cn(
    "text-xs sm:text-sm",
    active ? "border-primary bg-primary/10 text-primary" : "",
  );
}

function PulseFiltersForm(props: PulseFiltersProps) {
  const {
    isActus,
    draft,
    applyError,
    isApplying,
    clientMembershipClienteId,
    onPreset,
    onPeriodRange,
    onClienteId,
    onCreatedBy,
    onToggleStatus,
    onClearStatuses,
    onApply,
  } = props;

  const [clientOptions, setClientOptions] = useState<PulseClientOption[]>([]);
  const [userOptions, setUserOptions] = useState<PulseUserOption[]>([]);
  const [rangeOpen, setRangeOpen] = useState(false);

  const customRange: DateRange | undefined = {
    from: parseISO(draft.periodStart),
    to: parseISO(draft.periodEnd),
  };

  useEffect(() => {
    if (!isActus) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await webprocDb()
        .from("clientes")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (!cancelled && !error) {
        setClientOptions((data ?? []) as PulseClientOption[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isActus]);

  useEffect(() => {
    if (isActus) {
      setUserOptions([]);
      return;
    }
    if (clientMembershipClienteId == null) {
      setUserOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await webprocDb()
        .from("usuarios_clientes")
        .select("user_id, nome, email")
        .eq("cliente_id", clientMembershipClienteId)
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (cancelled || error) return;
      const options = (data ?? []).map((row) => {
        const nome = row.nome?.trim();
        const email = row.email?.trim();
        const label =
          nome || (email ? email.split("@")[0] : "") || "Usuário";
        return { userId: row.user_id as string, label };
      });
      setUserOptions(options);
    })();
    return () => {
      cancelled = true;
    };
  }, [isActus, clientMembershipClienteId]);

  const statusSummary =
    draft.statuses.length === 0
      ? "Todos os status"
      : draft.statuses.map((s) => PROCESSO_STATUS_LABELS[s]).join(", ");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Período</Label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["month", "Este mês"],
              ["7d", "Últimos 7 dias"],
              ["30d", "Últimos 30 dias"],
              ["custom", "Personalizado"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="sm"
              className={presetButtonClass(draft.preset === key)}
              onClick={() => onPreset(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {`${formatPeriodRangeLabel(draft.periodStart, draft.periodEnd)} ${pulseTimezoneParenthetical()}`}
        </p>
        {draft.preset === "custom" ? (
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                Escolher intervalo
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={customRange}
                locale={ptBR}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    onPeriodRange(
                      format(range.from, "yyyy-MM-dd"),
                      format(range.to, "yyyy-MM-dd"),
                    );
                    setRangeOpen(false);
                  }
                }}
                numberOfMonths={1}
              />
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      {isActus ? (
        <div className="space-y-2">
          <Label htmlFor="pulse-cliente-filter">Cliente</Label>
          <Select
            value={draft.clienteId != null ? String(draft.clienteId) : ALL_CLIENTS_VALUE}
            onValueChange={(value) =>
              onClienteId(value === ALL_CLIENTS_VALUE ? null : Number(value))
            }
          >
            <SelectTrigger id="pulse-cliente-filter" className="w-full sm:max-w-xs">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CLIENTS_VALUE}>Todos os clientes</SelectItem>
              {clientOptions.map((client) => (
                <SelectItem key={client.id} value={String(client.id)}>
                  {client.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Filtro analítico de supervisão — não altera sua identidade de acesso.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="pulse-user-filter">Usuário</Label>
        <Select
          value={draft.createdBy ?? ALL_USERS_VALUE}
          onValueChange={(value) =>
            onCreatedBy(value === ALL_USERS_VALUE ? null : value)
          }
        >
          <SelectTrigger id="pulse-user-filter" className="w-full sm:max-w-xs">
            <SelectValue placeholder="Todos os usuários" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_USERS_VALUE}>Todos os usuários</SelectItem>
            {userOptions.map((user) => (
              <SelectItem key={user.userId} value={user.userId}>
                {user.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isActus ? (
          <p className="text-xs text-muted-foreground">
            Lista detalhada de usuários será ampliada nas próximas entregas; use Todos por
            enquanto.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Status</Label>
          <Button type="button" variant="ghost" size="sm" onClick={onClearStatuses}>
            Todos os status
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{statusSummary}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROCESSO_STATUS_ORDER.map((status) => (
            <label
              key={status}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
            >
              <Checkbox
                checked={draft.statuses.includes(status)}
                onCheckedChange={() => onToggleStatus(status)}
              />
              <span>{PROCESSO_STATUS_LABELS[status]}</span>
            </label>
          ))}
        </div>
      </div>

      {applyError ? (
        <p className="text-sm text-destructive" role="alert">
          {applyError}
        </p>
      ) : null}

      <Button
        type="button"
        variant="legal"
        onClick={onApply}
        disabled={isApplying}
        className="w-full sm:w-auto min-h-11"
      >
        {isApplying ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Aplicando…
          </>
        ) : (
          "Aplicar filtros"
        )}
      </Button>
    </div>
  );
}

export function PulseFilters(props: PulseFiltersProps) {
  const isMobile = useIsMobile();
  const form = <PulseFiltersForm {...props} />;

  if (isMobile) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" className="w-full gap-2 min-h-11">
              <Filter className="h-4 w-4" />
              Filtros
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filtros do Pulse</SheetTitle>
            </SheetHeader>
            <div className="mt-6 pb-8">{form}</div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6 shadow-card">
      <h2 className="mb-4 text-sm font-semibold">Filtros</h2>
      {form}
    </div>
  );
}
