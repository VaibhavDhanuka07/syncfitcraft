"use client";

import { useEffect, useMemo, useState } from "react";

type SubmitAction = (formData: FormData) => void | Promise<void>;

export function ClientOrderForm({
  action,
  gsmValues,
  bfValues,
  inchValues,
  typeValues,
}: {
  action: SubmitAction;
  gsmValues: number[];
  bfValues: number[];
  inchValues: number[];
  typeValues: readonly string[];
}) {
  const [gsm, setGsm] = useState("");
  const [bf, setBf] = useState("");
  const [inch, setInch] = useState("");
  const [type, setType] = useState("");
  const [stock, setStock] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [effectivePrice, setEffectivePrice] = useState<number | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  const canCheck = useMemo(() => Boolean(gsm && bf && inch && type), [gsm, bf, inch, type]);

  useEffect(() => {
    let active = true;
    async function loadStock() {
      if (!canCheck) {
        setStock(null);
        setPrice(null);
        setEffectivePrice(null);
        return;
      }

      setStockLoading(true);
      try {
        const query = new URLSearchParams({ gsm, bf, inch, type }).toString();
        const response = await fetch(`/api/products/stock?${query}`, { cache: "no-store" });
        const payload = (await response.json()) as { available_stock?: number; price?: number; effective_price?: number };
        if (!active) return;
        setStock(typeof payload.available_stock === "number" ? payload.available_stock : null);
        setPrice(typeof payload.price === "number" ? payload.price : null);
        setEffectivePrice(typeof payload.effective_price === "number" ? payload.effective_price : null);
      } catch {
        if (!active) return;
        setStock(null);
      } finally {
        if (active) setStockLoading(false);
      }
    }

    loadStock();
    return () => {
      active = false;
    };
  }, [canCheck, gsm, bf, inch, type]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <select name="gsm" required value={gsm} onChange={(event) => setGsm(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">Select GSM</option>
        {gsmValues.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select name="bf" required value={bf} onChange={(event) => setBf(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">Select BF</option>
        {bfValues.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select name="inch" required value={inch} onChange={(event) => setInch(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">Select Inch</option>
        {inchValues.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select name="type" required value={type} onChange={(event) => setType(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">Select Type</option>
        {typeValues.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <input type="number" name="quantity" min={1} required placeholder="Quantity" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Submit Order</button>
      <div className="sm:col-span-2 lg:col-span-6">
        {!canCheck ? (
          <p className="text-xs text-slate-500">Select GSM, BF, Inch and Type to view available stock.</p>
        ) : stockLoading ? (
          <p className="text-xs text-slate-500">Checking available stock...</p>
        ) : (
          <div className="flex flex-wrap gap-4 text-sm font-medium text-slate-700">
            <p>Available stock: {stock ?? 0}</p>
            <p>Price: {price ?? 0}</p>
            <p>Effective: {effectivePrice ?? 0}</p>
          </div>
        )}
      </div>
    </form>
  );
}
