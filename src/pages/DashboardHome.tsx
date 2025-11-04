import { useEffect, useState } from "react";
import { useCliente } from "@/contexts/ClienteContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { format } from "date-fns";

interface ProcessoStats {
  total: number;
  pendentes: number;
  concluidos: number;
  emExecucao: number;
}

interface Processo {
  id_proc: number;
  n_processo: string;
  status: string;
  reclamante: string;
  dt_entrada: string;
  dt_fatal: string;
}

const DashboardHome = () => {
  const { cliente, user } = useCliente();
  const [stats, setStats] = useState<ProcessoStats>({
    total: 0,
    pendentes: 0,
    concluidos: 0,
    emExecucao: 0,
  });
  const [recentProcessos, setRecentProcessos] = useState<Processo[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchRecentProcessos();
      fetchMonthlyData();
    }
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("t_processoweb")
      .select("status")
      .eq("user_id", user.id);

    if (!error && data) {
      const stats = {
        total: data.length,
        pendentes: data.filter((p) => p.status === "Pendente").length,
        concluidos: data.filter((p) => p.status === "Concluído").length,
        emExecucao: data.filter((p) => p.status === "Em Execução").length,
      };
      setStats(stats);
    }
  };

  const fetchRecentProcessos = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("t_processoweb")
      .select("*")
      .eq("user_id", user.id)
      .order("dt_entrada", { ascending: false })
      .limit(5);

    if (!error && data) {
      setRecentProcessos(data);
    }
  };

  const fetchMonthlyData = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("t_processoweb")
      .select("dt_entrada")
      .eq("user_id", user.id)
      .order("dt_entrada", { ascending: true });

    if (!error && data) {
      const monthCounts: { [key: string]: number } = {};
      data.forEach((p) => {
        if (p.dt_entrada) {
          const month = format(new Date(p.dt_entrada), "MMM/yy");
          monthCounts[month] = (monthCounts[month] || 0) + 1;
        }
      });

      const chartData = Object.entries(monthCounts).map(([month, count]) => ({
        month,
        processos: count,
      }));

      setMonthlyData(chartData);
    }
  };

  const pieData = [
    { name: "Pendentes", value: stats.pendentes, color: "#f59e0b" },
    { name: "Concluídos", value: stats.concluidos, color: "#10b981" },
    { name: "Em Execução", value: stats.emExecucao, color: "#3b82f6" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary mb-2">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Visão geral dos seus processos jurídicos
        </p>
      </div>

      {/* Cards de indicadores */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-card hover:shadow-elegant transition-smooth">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Processos
            </CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="shadow-card hover:shadow-elegant transition-smooth">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendentes
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.pendentes}</div>
          </CardContent>
        </Card>

        <Card className="shadow-card hover:shadow-elegant transition-smooth">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Concluídos
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.concluidos}</div>
          </CardContent>
        </Card>

        <Card className="shadow-card hover:shadow-elegant transition-smooth">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Em Execução
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.emExecucao}</div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Evolução Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="processos" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de processos recentes */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Últimos Processos Cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Nº Processo</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Reclamante</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Data Fatal</th>
                </tr>
              </thead>
              <tbody>
                {recentProcessos.map((processo) => (
                  <tr key={processo.id_proc} className="border-b border-border hover:bg-accent/50 transition-smooth">
                    <td className="p-3 text-sm">{processo.n_processo}</td>
                    <td className="p-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          processo.status === "Pendente"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : processo.status === "Concluído"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}
                      >
                        {processo.status}
                      </span>
                    </td>
                    <td className="p-3 text-sm">{processo.reclamante}</td>
                    <td className="p-3 text-sm">
                      {processo.dt_fatal ? format(new Date(processo.dt_fatal), "dd/MM/yyyy") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentProcessos.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum processo cadastrado ainda
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardHome;
