import { useAction } from "convex/react";
import {
  RefreshCw,
  TrendingUp,
  Users,
  CheckCircle2,
  Euro,
  Target,
  BarChart3,
  MousePointerClick,
  Eye,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "../../convex/_generated/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  timestamp: string;
  platform: string;
  channel: string;
  kwalitatief: string;
}

interface SpendRow {
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  dateStart: string;
  dateStop: string;
}

type Period = "7" | "14" | "30" | "60" | "90";

// ─── Channel colours ──────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  Meta: "#1877f2",
  Google: "#34a853",
  TikTok: "#000000",
  LinkedIn: "#0077b5",
  Snapchat: "#fffc00",
  Onbekend: "#6b7280",
};

function channelColor(ch: string): string {
  return CHANNEL_COLORS[ch] ?? "#6c63ff";
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const NL_MONTHS = [
  "", "jan", "feb", "mrt", "apr", "mei", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
];

function dateRangeFor(period: Period, month: string): { since: string; until: string } {
  const now = new Date();
  if (month) {
    const [y, m] = month.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    return { since: fmt(firstDay), until: fmt(lastDay) };
  }
  const days = parseInt(period);
  const since = new Date(now.getTime() - days * 86_400_000);
  return { since: fmt(since), until: fmt(now) };
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function filterLeadsByRange(leads: Lead[], since: string, until: string): Lead[] {
  const s = new Date(since);
  const u = new Date(until);
  u.setHours(23, 59, 59, 999);
  return leads.filter((l) => {
    if (!l.timestamp) return false;
    const d = new Date(l.timestamp);
    return d >= s && d <= u;
  });
}

function getMonths(leads: Lead[]): string[] {
  const s = new Set<string>();
  for (const l of leads) {
    if (l.timestamp) {
      const d = new Date(l.timestamp);
      s.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  }
  return [...s].sort().reverse();
}

// ─── Channel table row calc ───────────────────────────────────────────────────

interface ChannelRow {
  channel: string;
  leads: number;
  kwali: number;
  pct: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpl: number | null;
  cpql: number | null;
  cpm: number | null;
  cpc: number | null;
}

function buildChannelRows(
  leads: Lead[],
  spendMap: Record<string, SpendRow>,
): ChannelRow[] {
  const map = new Map<string, { leads: number; kwali: number }>();
  for (const l of leads) {
    const ch = l.channel;
    if (!map.has(ch)) map.set(ch, { leads: 0, kwali: 0 });
    const g = map.get(ch)!;
    g.leads++;
    if (l.kwalitatief === "Ja") g.kwali++;
  }

  // Add channels that have spend but no leads
  for (const ch of Object.keys(spendMap)) {
    if (!map.has(ch)) map.set(ch, { leads: 0, kwali: 0 });
  }

  return [...map.entries()]
    .map(([channel, g]) => {
      const scored = leads.filter(
        (l) => l.channel === channel && (l.kwalitatief === "Ja" || l.kwalitatief === "Nee"),
      ).length;
      const sr = spendMap[channel];
      const spend = sr?.spend ?? 0;
      const impressions = sr?.impressions ?? 0;
      const clicks = sr?.clicks ?? 0;
      return {
        channel,
        leads: g.leads,
        kwali: g.kwali,
        pct: scored > 0 ? Math.round((g.kwali / scored) * 100) : null,
        spend,
        impressions,
        clicks,
        ctr: clicks > 0 && impressions > 0 ? clicks / impressions : null,
        cpl: g.leads > 0 && spend > 0 ? spend / g.leads : null,
        cpql: g.kwali > 0 && spend > 0 ? spend / g.kwali : null,
        cpm: impressions > 0 && spend > 0 ? (spend / impressions) * 1000 : null,
        cpc: clicks > 0 && spend > 0 ? spend / clicks : null,
      };
    })
    .sort((a, b) => b.leads - a.leads || b.spend - a.spend);
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function eur(n: number | null | undefined): string {
  if (n == null) return "—";
  return `€${n.toFixed(0)}`;
}

function eurCents(n: number | null | undefined): string {
  if (n == null) return "—";
  return `€${n.toFixed(2)}`;
}

function eurFull(n: number): string {
  return `€${n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pctStr(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function numFmt(n: number): string {
  return n.toLocaleString("nl-NL");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div className={`rounded-lg p-2 ${color}/10`}>
          <Icon className={`size-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function QualityBadge({ pct }: { pct: number | null }) {
  if (pct === null)
    return <Badge variant="outline" className="text-xs">Onbeoordeeld</Badge>;
  if (pct >= 40)
    return (
      <Badge className="text-xs bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 border-0">
        Goed
      </Badge>
    );
  if (pct >= 20)
    return (
      <Badge className="text-xs bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 border-0">
        Matig
      </Badge>
    );
  return (
    <Badge className="text-xs bg-red-500/15 text-red-500 hover:bg-red-500/15 border-0">
      Laag
    </Badge>
  );
}

function SpendBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[60px]">
        <div
          className="h-full rounded-full bg-blue-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-14 text-right">
        {eurFull(value)}
      </span>
    </div>
  );
}

function ChannelDonut({ rows }: { rows: ChannelRow[] }) {
  const total = rows.reduce((s, r) => s + r.leads, 0) || 1;
  const r = 40, cx = 60, cy = 60;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;

  const arcs = rows
    .filter((row) => row.leads > 0)
    .map((row) => {
      const fraction = row.leads / total;
      const offset = circumference * (1 - cumulative);
      const dasharray = `${circumference * fraction} ${circumference * (1 - fraction)}`;
      cumulative += fraction;
      return { ...row, offset, dasharray };
    });

  if (arcs.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Geen leads in deze periode</p>;
  }

  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        {arcs.map((arc) => (
          <circle
            key={arc.channel}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={channelColor(arc.channel)}
            strokeWidth="14"
            strokeDasharray={arc.dasharray}
            strokeDashoffset={arc.offset}
            transform="rotate(-90 60 60)"
            strokeLinecap="butt"
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="currentColor" fontSize="18" fontWeight="700">
          {rows.reduce((s, r) => s + r.leads, 0)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#8892a4" fontSize="9">leads</text>
      </svg>
      <div className="space-y-2 flex-1">
        {arcs.map((arc) => (
          <div key={arc.channel} className="flex items-center gap-2 text-xs">
            <div className="size-2.5 rounded-full shrink-0" style={{ background: channelColor(arc.channel) }} />
            <span className="text-muted-foreground flex-1">{arc.channel}</span>
            <span className="font-semibold">{arc.leads}</span>
            <span className="text-muted-foreground w-8 text-right">{Math.round((arc.leads / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpendDonut({ rows }: { rows: ChannelRow[] }) {
  const total = rows.reduce((s, r) => s + r.spend, 0) || 1;
  const r = 40, cx = 60, cy = 60;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;

  const arcs = rows
    .filter((row) => row.spend > 0)
    .map((row) => {
      const fraction = row.spend / total;
      const offset = circumference * (1 - cumulative);
      const dasharray = `${circumference * fraction} ${circumference * (1 - fraction)}`;
      cumulative += fraction;
      return { ...row, offset, dasharray };
    });

  if (arcs.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Geen spend in deze periode</p>;
  }

  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        {arcs.map((arc) => (
          <circle
            key={arc.channel}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={channelColor(arc.channel)}
            strokeWidth="14"
            strokeDasharray={arc.dasharray}
            strokeDashoffset={arc.offset}
            transform="rotate(-90 60 60)"
            strokeLinecap="butt"
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="currentColor" fontSize="14" fontWeight="700">
          {eurFull(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#8892a4" fontSize="9">totaal</text>
      </svg>
      <div className="space-y-2 flex-1">
        {arcs.map((arc) => (
          <div key={arc.channel} className="flex items-center gap-2 text-xs">
            <div className="size-2.5 rounded-full shrink-0" style={{ background: channelColor(arc.channel) }} />
            <span className="text-muted-foreground flex-1">{arc.channel}</span>
            <span className="font-semibold">{eurFull(arc.spend)}</span>
            <span className="text-muted-foreground w-8 text-right">{Math.round((arc.spend / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const fetchLeads = useAction(api.data.fetchLeads);
  const fetchMetaSpend = useAction(api.data.fetchMetaSpend);
  const fetchGoogleAdsSpend = useAction(api.data.fetchGoogleAdsSpend);
  const fetchTikTokSpend = useAction(api.data.fetchTikTokSpend);

  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [rawSpend, setRawSpend] = useState<SpendRow[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingSpend, setLoadingSpend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [period, setPeriod] = useState<Period>("30");
  const [month, setMonth] = useState("");

  const hasFetched = useRef(false);

  const { since, until } = useMemo(() => dateRangeFor(period, month), [period, month]);

  const loadLeads = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoadingLeads(true);
    setError(null);
    try {
      const data = await fetchLeads({});
      setAllLeads(data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden mislukt");
    } finally {
      setLoadingLeads(false);
      setRefreshing(false);
    }
  }, [fetchLeads]);

  const loadSpend = useCallback(async (s: string, u: string) => {
    setLoadingSpend(true);
    const results: SpendRow[] = [];
    const [metaResult, googleResult, tiktokResult] = await Promise.allSettled([
      fetchMetaSpend({ since: s, until: u }),
      fetchGoogleAdsSpend({ since: s, until: u }),
      fetchTikTokSpend({ since: s, until: u }),
    ]);
    if (metaResult.status === "fulfilled") results.push(...metaResult.value);
    if (googleResult.status === "fulfilled") results.push(googleResult.value);
    if (tiktokResult.status === "fulfilled" && tiktokResult.value.spend > 0) {
      results.push(tiktokResult.value);
    }
    setRawSpend(results);
    setLoadingSpend(false);
  }, [fetchMetaSpend, fetchGoogleAdsSpend, fetchTikTokSpend]);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      void loadLeads(false);
    }
  }, [loadLeads]);

  useEffect(() => {
    void loadSpend(since, until);
  }, [since, until, loadSpend]);

  const months = useMemo(() => getMonths(allLeads), [allLeads]);

  const filteredLeads = useMemo(
    () => filterLeadsByRange(allLeads, since, until),
    [allLeads, since, until],
  );

  // Build spend map keyed by channel
  const spendMap = useMemo(() => {
    const map: Record<string, SpendRow> = {};
    for (const s of rawSpend) {
      if (!map[s.channel]) {
        map[s.channel] = { ...s };
      } else {
        map[s.channel].spend += s.spend;
        map[s.channel].impressions += s.impressions;
        map[s.channel].clicks += s.clicks;
      }
    }
    return map;
  }, [rawSpend]);

  const channelRows = useMemo(
    () => buildChannelRows(filteredLeads, spendMap),
    [filteredLeads, spendMap],
  );

  // Global KPIs
  const totalLeads = filteredLeads.length;
  const totalKwali = filteredLeads.filter((l) => l.kwalitatief === "Ja").length;
  const totalScored = filteredLeads.filter(
    (l) => l.kwalitatief === "Ja" || l.kwalitatief === "Nee",
  ).length;
  const convPct = totalScored > 0 ? Math.round((totalKwali / totalScored) * 100) : 0;
  const totalSpend = Object.values(spendMap).reduce((s, v) => s + v.spend, 0);
  const totalImpressions = Object.values(spendMap).reduce((s, v) => s + v.impressions, 0);
  const totalClicks = Object.values(spendMap).reduce((s, v) => s + v.clicks, 0);
  const totalCPL = totalLeads > 0 && totalSpend > 0 ? totalSpend / totalLeads : null;
  const totalCPQL = totalKwali > 0 && totalSpend > 0 ? totalSpend / totalKwali : null;
  const totalCTR = totalClicks > 0 && totalImpressions > 0 ? totalClicks / totalImpressions : null;
  const totalCPM = totalImpressions > 0 && totalSpend > 0 ? (totalSpend / totalImpressions) * 1000 : null;

  const maxSpend = Math.max(...channelRows.map((r) => r.spend), 1);

  const periodLabel = month
    ? (() => {
        const [y, m] = month.split("-").map(Number);
        return `${NL_MONTHS[m]} ${y}`;
      })()
    : `laatste ${period} dagen`;

  if (loadingLeads) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Leads laden…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => void loadLeads(false)}>
          Opnieuw proberen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WorkinSociety — Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {allLeads.length} leads totaal
            {lastRefresh && <> · Ververst {lastRefresh.toLocaleTimeString("nl-NL")}</>}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void loadLeads(true);
            void loadSpend(since, until);
          }}
          disabled={refreshing}
          className="gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Vernieuwen
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm font-medium text-muted-foreground">Periode:</span>
            <div className="flex gap-1 flex-wrap">
              {(["7", "14", "30", "60", "90"] as Period[]).map((p) => (
                <Button
                  key={p}
                  variant={period === p && !month ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => { setPeriod(p); setMonth(""); }}
                >
                  {p}d
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-muted-foreground hidden sm:block">Maand:</span>
              <Select value={month} onValueChange={(v) => { setMonth(v); if (v) setPeriod("30"); }}>
                <SelectTrigger className="h-7 text-xs w-[140px]">
                  <SelectValue placeholder="Kalendermaand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Alle periodes —</SelectItem>
                  {months.map((ym) => {
                    const [y, m] = ym.split("-").map(Number);
                    return <SelectItem key={ym} value={ym}>{NL_MONTHS[m]} {y}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards - leads */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Leads</p>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <KpiCard label="Leads" value={totalLeads} sub={periodLabel} color="text-blue-500" icon={Users} />
          <KpiCard label="Kwali leads" value={totalKwali} sub={`${totalScored} beoordeeld`} color="text-emerald-500" icon={CheckCircle2} />
          <KpiCard
            label="Conversie"
            value={totalScored > 0 ? `${convPct}%` : "—"}
            sub="Kwali / beoordeeld"
            color={convPct >= 30 ? "text-emerald-500" : "text-amber-500"}
            icon={TrendingUp}
          />
          <KpiCard label="CPL" value={loadingSpend ? "…" : totalCPL !== null ? `€${totalCPL.toFixed(0)}` : "—"} sub="Kosten per lead" color="text-orange-500" icon={BarChart3} />
        </div>
      </div>

      {/* KPI cards - media */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Media performance</p>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard label="Totaal spend" value={totalSpend > 0 ? eurFull(totalSpend) : loadingSpend ? "…" : "—"} sub="Meta + Google + TikTok" color="text-purple-500" icon={Euro} />
          <KpiCard label="CPQL" value={loadingSpend ? "…" : totalCPQL !== null ? `€${totalCPQL.toFixed(0)}` : "—"} sub="Kosten per kwali lead" color="text-rose-500" icon={Target} />
          <KpiCard label="Impressies" value={totalImpressions > 0 ? numFmt(totalImpressions) : loadingSpend ? "…" : "—"} sub="Totaal bereik" color="text-sky-500" icon={Eye} />
          <KpiCard label="Clicks" value={totalClicks > 0 ? numFmt(totalClicks) : loadingSpend ? "…" : "—"} sub="Totaal clicks" color="text-indigo-500" icon={MousePointerClick} />
          <KpiCard
            label="CTR"
            value={loadingSpend ? "…" : pctStr(totalCTR)}
            sub={totalCPM !== null ? `CPM ${eurCents(totalCPM)}` : "Click-through rate"}
            color="text-violet-500"
            icon={TrendingUp}
          />
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Leads per kanaal
            </CardTitle>
          </CardHeader>
          <CardContent><ChannelDonut rows={channelRows} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Euro className="size-4 text-muted-foreground" />
              Spend per kanaal
              {loadingSpend && <span className="ml-auto text-xs text-muted-foreground animate-pulse">laden…</span>}
            </CardTitle>
          </CardHeader>
          <CardContent><SpendDonut rows={channelRows} /></CardContent>
        </Card>
      </div>

      {/* Channel breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Uitsplitsing per kanaal</CardTitle>
        </CardHeader>
        <CardContent>
          {channelRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Geen data voor deze periode</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b">
                    {["Kanaal", "Leads", "Kwali ✓", "Conversie", "Impressies", "Clicks", "CTR", "Spend", "CPL", "CPQL", "CPM", "CPC", ""].map((h) => (
                      <th key={h} className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {channelRows.map((row) => (
                    <tr key={row.channel} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      {/* Kanaal */}
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="size-2 rounded-full shrink-0" style={{ background: channelColor(row.channel) }} />
                          <span className="font-medium">{row.channel}</span>
                        </div>
                      </td>
                      {/* Leads */}
                      <td className="py-3 pr-3 tabular-nums font-semibold">{row.leads}</td>
                      {/* Kwali */}
                      <td className="py-3 pr-3">
                        <span className="text-emerald-500 font-semibold">{row.kwali}</span>
                      </td>
                      {/* Conversie */}
                      <td className="py-3 pr-3">
                        {row.pct !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${row.pct}%`,
                                  background: row.pct >= 40 ? "#22c55e" : row.pct >= 20 ? "#f59e0b" : "#ef4444",
                                }}
                              />
                            </div>
                            <span className="font-semibold tabular-nums text-xs"
                              style={{ color: row.pct >= 40 ? "#22c55e" : row.pct >= 20 ? "#f59e0b" : "#ef4444" }}>
                              {row.pct}%
                            </span>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      {/* Impressies */}
                      <td className="py-3 pr-3 tabular-nums text-xs">
                        {loadingSpend ? <span className="text-muted-foreground animate-pulse">…</span>
                          : row.impressions > 0 ? numFmt(row.impressions) : <span className="text-muted-foreground">—</span>}
                      </td>
                      {/* Clicks */}
                      <td className="py-3 pr-3 tabular-nums text-xs">
                        {loadingSpend ? <span className="text-muted-foreground animate-pulse">…</span>
                          : row.clicks > 0 ? numFmt(row.clicks) : <span className="text-muted-foreground">—</span>}
                      </td>
                      {/* CTR */}
                      <td className="py-3 pr-3 text-xs tabular-nums">
                        {loadingSpend ? <span className="text-muted-foreground animate-pulse">…</span>
                          : pctStr(row.ctr)}
                      </td>
                      {/* Spend */}
                      <td className="py-3 pr-3">
                        {loadingSpend ? <span className="text-muted-foreground text-xs animate-pulse">laden…</span>
                          : row.spend > 0 ? <SpendBar value={row.spend} max={maxSpend} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      {/* CPL */}
                      <td className="py-3 pr-3 tabular-nums font-semibold">
                        {loadingSpend ? <span className="text-muted-foreground text-xs animate-pulse">…</span> : eur(row.cpl)}
                      </td>
                      {/* CPQL */}
                      <td className="py-3 pr-3 tabular-nums font-semibold">
                        {loadingSpend ? <span className="text-muted-foreground text-xs animate-pulse">…</span> : eur(row.cpql)}
                      </td>
                      {/* CPM */}
                      <td className="py-3 pr-3 tabular-nums text-xs text-muted-foreground">
                        {loadingSpend ? <span className="animate-pulse">…</span> : eurCents(row.cpm)}
                      </td>
                      {/* CPC */}
                      <td className="py-3 pr-3 tabular-nums text-xs text-muted-foreground">
                        {loadingSpend ? <span className="animate-pulse">…</span> : eurCents(row.cpc)}
                      </td>
                      {/* Quality badge */}
                      <td className="py-3"><QualityBadge pct={row.pct} /></td>
                    </tr>
                  ))}
                </tbody>
                {channelRows.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-foreground/20">
                      <td className="py-3 pr-3 font-bold text-xs uppercase tracking-wide text-muted-foreground">Totaal</td>
                      <td className="py-3 pr-3 font-bold tabular-nums">{totalLeads}</td>
                      <td className="py-3 pr-3 font-bold text-emerald-500">{totalKwali}</td>
                      <td className="py-3 pr-3">
                        {totalScored > 0 ? (
                          <span className="font-bold text-xs"
                            style={{ color: convPct >= 40 ? "#22c55e" : convPct >= 20 ? "#f59e0b" : "#ef4444" }}>
                            {convPct}%
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-3 pr-3 font-bold tabular-nums text-xs">{numFmt(totalImpressions)}</td>
                      <td className="py-3 pr-3 font-bold tabular-nums text-xs">{numFmt(totalClicks)}</td>
                      <td className="py-3 pr-3 font-bold text-xs">{pctStr(totalCTR)}</td>
                      <td className="py-3 pr-3 font-bold">{totalSpend > 0 ? eurFull(totalSpend) : "—"}</td>
                      <td className="py-3 pr-3 font-bold tabular-nums">{eur(totalCPL)}</td>
                      <td className="py-3 pr-3 font-bold tabular-nums">{eur(totalCPQL)}</td>
                      <td className="py-3 pr-3 text-xs">{eurCents(totalCPM)}</td>
                      <td className="py-3 pr-3 text-xs">{eurCents(totalClicks > 0 && totalSpend > 0 ? totalSpend / totalClicks : null)}</td>
                      <td className="py-3"><QualityBadge pct={convPct} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Leads per platform (ruwe waarden)</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const platformMap = new Map<string, { total: number; kwali: number }>();
            for (const l of filteredLeads) {
              const p = l.platform || "(leeg)";
              if (!platformMap.has(p)) platformMap.set(p, { total: 0, kwali: 0 });
              const g = platformMap.get(p)!;
              g.total++;
              if (l.kwalitatief === "Ja") g.kwali++;
            }
            const entries = [...platformMap.entries()].sort((a, b) => b[1].total - a[1].total);
            const maxTotal = entries[0]?.[1].total ?? 1;

            if (entries.length === 0) {
              return <p className="text-sm text-muted-foreground text-center py-4">Geen leads in deze periode</p>;
            }

            return (
              <div className="space-y-3">
                {entries.map(([platform, g]) => {
                  const scored = filteredLeads.filter(
                    (l) => (l.platform || "(leeg)") === platform &&
                      (l.kwalitatief === "Ja" || l.kwalitatief === "Nee"),
                  ).length;
                  const pct = scored > 0 ? Math.round((g.kwali / scored) * 100) : null;
                  return (
                    <div key={platform} className="flex items-center gap-3">
                      <span className="w-28 text-xs text-muted-foreground truncate shrink-0">{platform}</span>
                      <div className="flex-1 h-5 bg-muted/40 rounded overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${Math.max(4, (g.total / maxTotal) * 100)}%`,
                            background: channelColor(
                              platform === "(leeg)" ? "Onbekend"
                                : platform.toLowerCase() === "google" ? "Google"
                                  : "Meta"
                            ),
                            opacity: 0.75,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold w-5 tabular-nums">{g.total}</span>
                      <span className="text-xs text-emerald-500 font-semibold w-10 tabular-nums text-right">
                        {pct !== null ? `${pct}%` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
