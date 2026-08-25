import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MONTH_LABELS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const CHANNEL_META = {
  direct: { name: "Vendas Diretas", color: "blue" },
  ecommerce: { name: "E-commerce", color: "aqua" },
  marketplaces: { name: "Marketplaces", color: "orange" },
  partners: { name: "Parcerias", color: "yellow" },
};

function pctDelta(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function sampleWeekly(daily) {
  const n = daily.length;
  if (n === 0) return [];
  const buckets = 5;
  return Array.from({ length: buckets }, (_, i) => {
    const idx = Math.min(n - 1, Math.round(((i + 1) / buckets) * n) - 1);
    return { label: `Sem ${i + 1}`, value: daily[idx].value };
  });
}

export function useSalesOverview() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(() => {
    let cancelled = false;

    (async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const [overviewRes, customersRes, channelRes, dailyRes, monthlyRes] = await Promise.all([
          supabase.from("kpi_overview").select("*").single(),
          supabase.from("kpi_customers").select("*").single(),
          supabase.from("kpi_channel_breakdown").select("*"),
          supabase.from("kpi_revenue_daily").select("*").order("day"),
          supabase.from("kpi_revenue_monthly").select("*").order("month"),
        ]);

        for (const res of [overviewRes, customersRes, channelRes, dailyRes, monthlyRes]) {
          if (res.error) throw res.error;
        }
        if (cancelled) return;

        const overview = overviewRes.data;
        const customers = customersRes.data;

        let running = 0;
        const revenueDaily = dailyRes.data.map((row) => {
          running += Number(row.day_total);
          const d = new Date(row.day);
          return { day: d.getDate(), label: `${d.getDate()} ${MONTH_LABELS_PT[d.getMonth()]}`, value: running };
        });

        const revenueWeekly = sampleWeekly(revenueDaily);

        const revenueMonthly = monthlyRes.data.map((row) => {
          const d = new Date(row.month);
          return { label: MONTH_LABELS_PT[d.getMonth()], value: Number(row.month_total) };
        });

        const channelBreakdown = channelRes.data.map((row) => ({
          id: row.channel,
          name: CHANNEL_META[row.channel]?.name ?? row.channel,
          color: CHANNEL_META[row.channel]?.color ?? "blue",
          value: Number(row.total),
          pct: Number(row.pct),
        }));

        const revenueMtd = Number(overview.revenue_mtd);
        const revenuePrevMonth = Number(overview.revenue_prev_month);
        const newCustomersMtd = Number(customers.new_customers_mtd);
        const newCustomersPrevMonth = Number(customers.new_customers_prev_month);

        setState({
          loading: false,
          error: null,
          data: {
            revenueMtd,
            revenueDeltaPct: pctDelta(revenueMtd, revenuePrevMonth),
            dealsOpen: Number(overview.deals_open),
            dealsClosedMtd: Number(overview.deals_closed_mtd),
            avgDeal: Number(overview.avg_deal),
            newCustomersMtd,
            newCustomersDeltaPct: pctDelta(newCustomersMtd, newCustomersPrevMonth),
            revenueDaily,
            revenueWeekly,
            revenueMonthly,
            channelBreakdown,
          },
        });
      } catch (error) {
        if (!cancelled) setState({ loading: false, error, data: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  return { ...state, refetch: load };
}
