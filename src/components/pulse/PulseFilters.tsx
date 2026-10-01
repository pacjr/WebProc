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
import {
  operationalCollectionQueryToolbarBandClassName,
  operationalCollectionQueryToolbarClassName,
} from "@/lib/operational-visual-language";

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
  return cn("h-8 px-2.5 text-xs", active ? "border-primary bg-primary/10 text-primary" : "");
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
  const [statusOpen, setStatusOpen] = useState(false);

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
        const label = nome || (email ? email.split("@")[0] : "") || "Usuário";
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
      ? "Todos"
      : `${draft.statuses.length} selecionado(s)`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Período</Label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["month", "Este mês"],
                ["7d", "Últimos 7 dias"],
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
            {draft.preset === "custom" ? (
              <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Intervalo
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
          <p className="text-[11px] text-muted-foreground">
            {formatPeriodRangeLabel(draft.periodStart, draft.periodEnd)}{" "}
            {pulseTimezoneParenthetical()}
          </p>
        </div>

        {isActus ? (
          <div className="w-full space-y-1 sm:w-auto sm:min-w-[12rem]">
            <Label htmlFor="pulse-cliente-filter" className="text-xs text-muted-foreground">
              Cliente
            </Label>
            <Select
              value={draft.clienteId != null ? String(draft.clienteId) : ALL_CLIENTS_VALUE}
              onValueChange={(value) =>
                onClienteId(value === ALL_CLIENTS_VALUE ? null : Number(value))
              }
            >
              <SelectTrigger id="pulse-cliente-filter" className="h-9 bg-background">
                <SelectValue placeholder="Todos" />
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
          </div>
        ) : null}

        {!isActus ? (
          <div className="w-full space-y-1 sm:w-auto sm:min-w-[12rem]">
            <Label htmlFor="pulse-user-filter" className="text-xs text-muted-foreground">
              Usuário
            </Label>
            <Select
              value={draft.createdBy ?? ALL_USERS_VALUE}
              onValueChange={(value) =>
                onCreatedBy(value === ALL_USERS_VALUE ? null : value)
              }
            >
              <SelectTrigger id="pulse-user-filter" className="h-9 bg-background">
                <SelectValue placeholder="Todos" />
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
          </div>
        ) : null}

        <div className="w-full space-y-1 sm:w-auto">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Popover open={statusOpen} onOpenChange={setStatusOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-9 w-full sm:w-[10rem] justify-between">
                {statusSummary}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium">Filtrar status</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onClearStatuses}>
                  Limpar
                </Button>
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {PROCESSO_STATUS_ORDER.map((status) => (
                  <li key={status}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted/50">
                      <Checkbox
                        checked={draft.statuses.includes(status)}
                        onCheckedChange={() => onToggleStatus(status)}
                      />
                      {PROCESSO_STATUS_LABELS[status]}
                    </label>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          type="button"
          variant="legal"
          onClick={onApply}
          disabled={isApplying}
          className="h-9 w-full sm:w-auto min-h-9"
        >
          {isApplying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Aplicando…
            </>
          ) : (
            "Aplicar"
          )}
        </Button>
      </div>

      {applyError ? (
        <p className="text-sm text-destructive" role="alert">
          {applyError}
        </p>
      ) : null}
    </div>
  );
}

export function PulseFilters(props: PulseFiltersProps) {
  const isMobile = useIsMobile();
  const form = <PulseFiltersForm {...props} />;

  if (isMobile) {
    return (
      <div className={operationalCollectionQueryToolbarClassName}>
        <div className={operationalCollectionQueryToolbarBandClassName}>
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" className="w-full gap-2 min-h-10">
                <Filter className="h-4 w-4" />
                Filtros do Pulse
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="mt-4 pb-6">{form}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    );
  }

  return (
    <div className={operationalCollectionQueryToolbarClassName}>
      <div className={operationalCollectionQueryToolbarBandClassName}>{form}</div>
    </div>
  );
}
