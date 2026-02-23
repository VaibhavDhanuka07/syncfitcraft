"use client";

import { useState } from "react";

type ImportResult = {
  updated?: number;
  created?: number;
  errors: number;
};

export function ImportStockForm() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/import", {
      method: "POST",
      body: formData,
    });

    const json = await response.json();

    if (!response.ok) {
      setError(json.error ?? "Import failed");
      setLoading(false);
      return;
    }

    setResult(json as ImportResult);
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 p-4">
        <label className="grid gap-1 text-sm">
          Import target
          <select name="target" defaultValue="stock" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="stock">Stock/Price update (product_id or gsm,bf,inch,type + stock/price)</option>
            <option value="orders">Orders update (order_id,status)</option>
          </select>
        </label>
        <input type="file" name="file" accept=".csv,.xlsx" required className="block w-full text-sm" />
        <button disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
          {loading ? "Importing..." : "Import File"}
        </button>
      </form>

      {error ? <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

      {result ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Updated: {result.updated ?? 0} | Created: {result.created ?? 0} | Errors: {result.errors}
        </div>
      ) : null}
    </div>
  );
}
