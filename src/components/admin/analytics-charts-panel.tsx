"use client";

import dynamic from "next/dynamic";

const AnalyticsCharts = dynamic(() => import("@/components/admin/analytics-charts").then((m) => m.AnalyticsCharts), {
  ssr: false,
  loading: () => <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm">Loading charts...</p>,
});

export function AnalyticsChartsPanel({
  monthly,
  yearly,
}: {
  monthly: Array<{ period: string; orders: number; revenue: number }>;
  yearly: Array<{ period: string; orders: number; revenue: number }>;
}) {
  return <AnalyticsCharts monthly={monthly} yearly={yearly} />;
}
