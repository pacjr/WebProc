import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import {
  formatAuthorDisplay,
  listProcessosPaginated,
} from "@/integrations/supabase/webproc-api";
import type {
  ProcessoStatus,
  WebProcProcessoListItem,
  WebProcProcessosListResult,
} from "@/integrations/supabase/webproc-types";
import { getBusinessDateToday } from "@/integrations/supabase/webproc-validation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useWebProc } from "@/contexts/WebProcContext";
import { processoStatusLabel } from "@/lib/webproc-status-labels";
import { cancellationReasonForList } from "@/lib/webproc-cancellation-display";
import { webprocEditableFieldClassName } from "@/lib/webproc-field-styles";
import {
  operationalCollectionDataPanelClassName,
  operationalCollectionIdentityAccent,
  operationalCollectionPageHeaderBandClassName,
  operationalCollectionPageHeaderClassName,
  operationalCollectionPaginationFooterClassName,
  operationalCollectionQueryAccent,
  operationalCollectionQueryToolbarBandClassName,
  operationalCollectionQueryToolbarClassName,
  protocoloWorkspaceClassName,
} from "@/lib/operational-visual-language";
import {
  PROCESSOS_LIST_PAGE_SIZES,
  buildProcessosListSearchParams,
  formatProcessosPageRange,
  parseProcessosListSearchParams,
  processosListQueryHasFilters,
  type ProcessosListFatalFilter,
  type ProcessosListPageSize,
  type ProcessosListQuery,
} from "@/lib/webproc-processos-list-query";
import { cn } from "@/lib/utils";

function formatDate(value: string | null) {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy");
}

function isDtFatalOverdue(
  dtFatal: string | null,
  status: WebProcProcessoListItem["status"],
) {
  if (!dtFatal) return false;
  if (status !== "EM_PREENCHIMENTO" && status !== "PENDENTE") return false;
  const fatalDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date(dtFatal));
  return fatalDay < getBusinessDateToday();
}

function isDtFatalToday(dtFatal: string | null) {
  if (!dtFatal) return false;
  const fatalDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date(dtFatal));
  return fatalDay === getBusinessDateToday();
}

const STATUS_FILTER_OPTIONS: { value: "todos" | ProcessoStatus; label: string }[] = [
  { value: "todos", label: "Todos os status" },
  { value: "EM_PREENCHIMENTO", label: "Em preenchimento" },
  { value: "PENDENTE", label: "Pendente" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "IMPORTADO", label: "Importado" },
  { value: "CONCLUIDO", label: "Concluído" },
];

const FATAL_FILTER_OPTIONS: { value: ProcessosListFatalFilter; label: string }[] = [
  { value: "todas", label: "Todas as datas fatais" },
  { value: "hoje", label: "Data fatal hoje" },
  { value: "vencidas", label: "Data fatal vencida" },
  { value: "futuras", label: "Data fatal futura" },
];

function ProtocoloListCard({
  item,
  onOpen,
  showAuthor,
}: {
  item: WebProcProcessoListItem;
  onOpen: () => void;
  showAuthor: boolean;
}) {
  const author = formatAuthorDisplay(item.author);
  const overdue = isDtFatalOverdue(item.dt_fatal, item.status);
  const fatalToday = isDtFatalToday(item.dt_fatal);
  const cancelReason = cancellationReasonForList(item.status, item.motivo_cancelamento);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border border-t-2 border-t-primary/90 bg-card p-4 text-left shadow-sm transition-smooth hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif font-semibold text-primary">Protocolo #{item.id_proc}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {item.n_processo || item.exec_prov || "Sem número informado"}
          </p>
        </div>
        <Badge variant="secondary">{processoStatusLabel(item.status)}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Reclamante</dt>
          <dd className="font-medium truncate">{item.reclamante || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Data fatal</dt>
          <dd className="font-medium flex flex-wrap items-center gap-2">
            {formatDate(item.dt_fatal)}
            {overdue ? (
              <Badge variant="destructive" className="text-xs">
                Prazo vencido
              </Badge>
            ) : fatalToday ? (
              <Badge variant="outline" className="text-xs border-amber-600/50 text-amber-800 dark:text-amber-200">
                Hoje
              </Badge>
            ) : null}
          </dd>
        </div>
        {showAuthor ? (
          <div className="col-span-2">
            <dt className="text-muted-foreground">Cadastrado por</dt>
            <dd className="font-medium">{author.primary}</dd>
          </div>
        ) : null}
        <div className="col-span-2">
          <dt className="text-muted-foreground">Motivo do cancelamento</dt>
          <dd className="font-medium line-clamp-2" title={cancelReason.full ?? undefined}>
            {cancelReason.display}
          </dd>
        </div>
      </dl>
    </button>
  );
}

export default function ProcessosList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { connectAccess } = useWebProc();
  const isClientActor = connectAccess.kind === "CLIENT";

  const query = useMemo(
    () => parseProcessosListSearchParams(searchParams),
    [searchParams],
  );

  const [searchDraft, setSearchDraft] = useState(query.q);
  const [result, setResult] = useState<WebProcProcessosListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const patchQuery = useCallback(
    (patch: Partial<ProcessosListQuery>) => {
      const next = { ...query, ...patch };
      setSearchParams(buildProcessosListSearchParams(next), { replace: true });
    },
    [query, setSearchParams],
  );

  useEffect(() => {
    setSearchDraft(query.q);
  }, [query.q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchDraft.trim() === query.q) {
        return;
      }
      patchQuery({ q: searchDraft.trim(), page: 1 });
    }, 350);
    return () => window.clearTimeout(handle);
  }, [searchDraft, query.q, patchQuery]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const { result: loaded, error } = await listProcessosPaginated({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      fatal: query.fatal,
      search: query.q,
      sort: query.sort,
    });

    if (error) {
      setLoadError(error.message);
      toast.error("Erro ao carregar protocolos: " + error.message);
      setResult(null);
    } else if (loaded) {
      if (loaded.pageCount > 0 && query.page > loaded.pageCount) {
        patchQuery({ page: loaded.pageCount });
        setLoading(false);
        return;
      }
      setResult(loaded);
    }

    setLoading(false);
  }, [query, patchQuery]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const hasFilters = processosListQueryHasFilters(query);
  const processos = result?.items ?? [];
  const total = result?.total ?? 0;
  const pageCount = result?.pageCount ?? 0;

  const openDetail = (idProc: number) => {
    const listSearch = searchParams.toString();
    navigate(`/app/processos/${idProc}`, {
      state: { listSearch: listSearch ? `?${listSearch}` : "" },
    });
  };

  const clearFilters = () => {
    setSearchDraft("");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  return (
    <div className={cn(protocoloWorkspaceClassName, "space-y-4")}>
      <header className={operationalCollectionPageHeaderClassName}>
        <div
          className={cn(
            operationalCollectionPageHeaderBandClassName,
            "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
          )}
        >
          <div>
            <h1
              className={cn(
                "font-serif text-2xl sm:text-3xl font-bold",
                operationalCollectionIdentityAccent.titleAccent,
              )}
            >
              Protocolos
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {isClientActor
                ? "Consulte e abra protocolos do seu cliente. A listagem carrega apenas a página atual no servidor."
                : "Supervisão Actus — protocolos visíveis conforme permissões. Paginação e filtros no servidor."}
            </p>
          </div>
          {isClientActor ? (
            <Button variant="legal" className="shrink-0" asChild>
              <Link to="/app/processos/novo">
                <Plus className="h-4 w-4 mr-2" aria-hidden />
                Novo protocolo
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <div className={operationalCollectionQueryToolbarClassName}>
        <div className={operationalCollectionQueryToolbarBandClassName}>
          <p
            className={cn(
              "font-serif text-sm font-semibold leading-snug",
              operationalCollectionQueryAccent.titleAccent,
            )}
          >
            Consulta da listagem
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Filtros aplicados no servidor — apenas a página atual é carregada.
          </p>
        </div>
        <div className="px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <label htmlFor="protocolos_busca" className="text-xs font-medium text-muted-foreground">
              Buscar
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="protocolos_busca"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Nº do processo, execução, reclamante ou reclamado"
                className={cn("pl-9", webprocEditableFieldClassName)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
            <div className="space-y-1.5">
              <label htmlFor="protocolos_status" className="text-xs font-medium text-muted-foreground">
                Status
              </label>
              <Select
                value={query.status ?? "todos"}
                onValueChange={(value) =>
                  patchQuery({
                    status: value === "todos" ? null : (value as ProcessoStatus),
                    page: 1,
                  })
                }
              >
                <SelectTrigger id="protocolos_status" className="bg-background">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="protocolos_fatal" className="text-xs font-medium text-muted-foreground">
                Data fatal
              </label>
              <Select
                value={query.fatal}
                onValueChange={(value) =>
                  patchQuery({ fatal: value as ProcessosListFatalFilter, page: 1 })
                }
              >
                <SelectTrigger id="protocolos_fatal" className="bg-background">
                  <SelectValue placeholder="Data fatal" />
                </SelectTrigger>
                <SelectContent>
                  {FATAL_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="protocolos_ordenacao" className="text-xs font-medium text-muted-foreground">
                Ordenação
              </label>
              <Select
                value={query.sort}
                onValueChange={(value) =>
                  patchQuery({
                    sort: value === "dt_fatal" ? "dt_fatal" : "recent",
                    page: 1,
                  })
                }
              >
                <SelectTrigger id="protocolos_ordenacao" className="bg-background">
                  <SelectValue placeholder="Ordenação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="dt_fatal">Data fatal (crescente)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasFilters ? (
            <Button type="button" variant="outline" className="shrink-0" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" aria-hidden />
              Limpar
            </Button>
          ) : null}
        </div>
        </div>
      </div>

      <div className={operationalCollectionDataPanelClassName}>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground" aria-busy="true">
            Carregando protocolos...
          </div>
        ) : loadError ? (
          <div className="p-8 text-center space-y-4">
            <p className="text-muted-foreground" role="alert">
              Não foi possível carregar os protocolos. Tente novamente.
            </p>
            <Button type="button" variant="outline" onClick={() => void loadPage()}>
              Tentar novamente
            </Button>
          </div>
        ) : total === 0 && !hasFilters ? (
          <div className="p-8 text-center space-y-4">
            <p className="text-muted-foreground">Nenhum protocolo cadastrado ainda.</p>
            {isClientActor ? (
              <Button variant="legal" asChild>
                <Link to="/app/processos/novo">Criar primeiro protocolo</Link>
              </Button>
            ) : null}
          </div>
        ) : total === 0 && hasFilters ? (
          <div className="p-8 text-center space-y-4">
            <p className="text-muted-foreground" role="status">
              Nenhum protocolo corresponde aos filtros atuais.
            </p>
            <Button type="button" variant="outline" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
        ) : (
          <>
            <div className="md:hidden p-4 space-y-3">
              {processos.map((processo) => (
                <ProtocoloListCard
                  key={processo.id_proc}
                  item={processo}
                  showAuthor={!isClientActor}
                  onOpen={() => openDetail(processo.id_proc)}
                />
              ))}
            </div>
            <div className={isClientActor ? "hidden md:block" : "hidden md:block overflow-x-auto"}>
              <Table>
                <TableHeader>
                  <TableRow
                    className={cn(
                      operationalCollectionIdentityAccent.tableHeadTint,
                      "hover:bg-primary/[0.045] dark:hover:bg-primary/[0.08]",
                    )}
                  >
                    <TableHead>Protocolo</TableHead>
                    <TableHead>Nº do Processo</TableHead>
                    <TableHead>Execução Provisória</TableHead>
                    <TableHead>Reclamante</TableHead>
                    <TableHead>Data de Entrada</TableHead>
                    <TableHead>Data Fatal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[10rem] max-w-[14rem]">
                      Motivo do cancelamento
                    </TableHead>
                    {!isClientActor ? <TableHead>Cadastrado por</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processos.map((processo) => {
                    const author = formatAuthorDisplay(processo.author);
                    const overdue = isDtFatalOverdue(processo.dt_fatal, processo.status);
                    const fatalToday = isDtFatalToday(processo.dt_fatal);
                    const cancelReason = cancellationReasonForList(
                      processo.status,
                      processo.motivo_cancelamento,
                    );

                    return (
                      <TableRow
                        key={processo.id_proc}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDetail(processo.id_proc)}
                      >
                        <TableCell className="font-medium">{processo.id_proc}</TableCell>
                        <TableCell className="max-w-[8rem] truncate" title={processo.n_processo ?? undefined}>
                          {processo.n_processo || "—"}
                        </TableCell>
                        <TableCell className="max-w-[8rem] truncate" title={processo.exec_prov ?? undefined}>
                          {processo.exec_prov || "—"}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate" title={processo.reclamante ?? undefined}>
                          {processo.reclamante || "—"}
                        </TableCell>
                        <TableCell>{formatDate(processo.dt_entrada)}</TableCell>
                        <TableCell>
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {formatDate(processo.dt_fatal)}
                            {overdue ? (
                              <Badge variant="destructive" className="text-xs">
                                Prazo vencido
                              </Badge>
                            ) : fatalToday ? (
                              <Badge
                                variant="outline"
                                className="text-xs border-amber-600/50 text-amber-800 dark:text-amber-200"
                              >
                                Hoje
                              </Badge>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{processoStatusLabel(processo.status)}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[14rem]">
                          <span className="block truncate" title={cancelReason.full ?? undefined}>
                            {cancelReason.display}
                          </span>
                        </TableCell>
                        {!isClientActor ? (
                          <TableCell>
                            <div className="leading-tight">
                              <p className="font-medium">{author.primary}</p>
                              {author.secondary ? (
                                <p className="text-xs text-muted-foreground">{author.secondary}</p>
                              ) : null}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <footer className={operationalCollectionPaginationFooterClassName}>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {formatProcessosPageRange(query.page, query.pageSize, total)}
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Por página</span>
                  <Select
                    value={String(query.pageSize)}
                    onValueChange={(value) =>
                      patchQuery({
                        pageSize: Number(value) as ProcessosListPageSize,
                        page: 1,
                      })
                    }
                  >
                    <SelectTrigger className="h-9 w-[4.5rem] bg-background" aria-label="Itens por página">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROCESSOS_LIST_PAGE_SIZES.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={query.page <= 1 || loading}
                    onClick={() => patchQuery({ page: query.page - 1 })}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" aria-hidden />
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums min-w-[4.5rem] text-center">
                    {pageCount > 0 ? `${query.page} / ${pageCount}` : "—"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pageCount === 0 || query.page >= pageCount || loading}
                    onClick={() => patchQuery({ page: query.page + 1 })}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4 ml-1" aria-hidden />
                  </Button>
                </div>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
