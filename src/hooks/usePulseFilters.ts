import { useCallback, useMemo, useState } from "react";
import type { PulseFilter } from "@/integrations/supabase/pulse-types";
import type { ProcessoStatus } from "@/integrations/supabase/webproc-types";
import {
  businessDateDaysAgo,
  firstDayOfCurrentMonthBusinessDate,
  todayBusinessDate,
} from "@/lib/pulse-dates";

export type PulsePeriodPreset = "month" | "7d" | "custom";

export interface PulseFilterDraft {
  preset: PulsePeriodPreset;
  periodStart: string;
  periodEnd: string;
  clienteId: number | null;
  createdBy: string | null;
  statuses: ProcessoStatus[];
}

function defaultDraft(): PulseFilterDraft {
  return {
    preset: "month",
    periodStart: firstDayOfCurrentMonthBusinessDate(),
    periodEnd: todayBusinessDate(),
    clienteId: null,
    createdBy: null,
    statuses: [],
  };
}

function draftFromPreset(preset: PulsePeriodPreset, current: PulseFilterDraft): PulseFilterDraft {
  const end = todayBusinessDate();
  switch (preset) {
    case "month":
      return {
        ...current,
        preset,
        periodStart: firstDayOfCurrentMonthBusinessDate(),
        periodEnd: end,
      };
    case "7d":
      return { ...current, preset, periodStart: businessDateDaysAgo(6), periodEnd: end };
    case "custom":
      return { ...current, preset };
    default:
      return current;
  }
}

export function pulseDraftToApiFilter(
  draft: PulseFilterDraft,
  actor: "CLIENT" | "ACTUS",
): PulseFilter {
  return {
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    createdBy: draft.createdBy ?? undefined,
    status: draft.statuses.length > 0 ? draft.statuses : undefined,
    clienteId:
      actor === "ACTUS" && draft.clienteId != null ? draft.clienteId : undefined,
  };
}

export function usePulseFilters() {
  const initial = useMemo(() => defaultDraft(), []);
  const [draft, setDraft] = useState<PulseFilterDraft>(initial);
  const [applied, setApplied] = useState<PulseFilterDraft>(initial);
  const [applyError, setApplyError] = useState<string | null>(null);

  const setPreset = useCallback((preset: PulsePeriodPreset) => {
    setDraft((current) => draftFromPreset(preset, current));
    setApplyError(null);
  }, []);

  const setPeriodRange = useCallback((periodStart: string, periodEnd: string) => {
    setDraft((current) => ({
      ...current,
      preset: "custom",
      periodStart,
      periodEnd,
    }));
    setApplyError(null);
  }, []);

  const setClienteId = useCallback((clienteId: number | null) => {
    setDraft((current) => ({
      ...current,
      clienteId,
      createdBy: null,
    }));
    setApplyError(null);
  }, []);

  const setCreatedBy = useCallback((createdBy: string | null) => {
    setDraft((current) => ({ ...current, createdBy }));
    setApplyError(null);
  }, []);

  const toggleStatus = useCallback((status: ProcessoStatus) => {
    setDraft((current) => {
      const has = current.statuses.includes(status);
      return {
        ...current,
        statuses: has
          ? current.statuses.filter((s) => s !== status)
          : [...current.statuses, status],
      };
    });
    setApplyError(null);
  }, []);

  const clearStatuses = useCallback(() => {
    setDraft((current) => ({ ...current, statuses: [] }));
    setApplyError(null);
  }, []);

  const applyFilters = useCallback(() => {
    if (draft.periodStart > draft.periodEnd) {
      setApplyError("A data inicial deve ser anterior ou igual à data final.");
      return false;
    }
    setApplyError(null);
    setApplied({ ...draft });
    return true;
  }, [draft]);

  return {
    draft,
    applied,
    applyError,
    setPreset,
    setPeriodRange,
    setClienteId,
    setCreatedBy,
    toggleStatus,
    clearStatuses,
    applyFilters,
  };
}
