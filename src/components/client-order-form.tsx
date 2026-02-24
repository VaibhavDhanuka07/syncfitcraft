"use client";

import { useEffect, useMemo, useState } from "react";

type SubmitAction = (formData: FormData) => void | Promise<void>;
type OrderRowValue = {
  id: string;
  gsm: string;
  bf: string;
  inch: string;
  type: string;
  quantity: string;
};

type OrderRowProps = {
  index: number;
  row: OrderRowValue;
  gsmValues: number[];
  bfValues: number[];
  inchValues: number[];
  typeValues: readonly string[];
  canRemove: boolean;
  onChange: (id: string, field: keyof Omit<OrderRowValue, "id">, value: string) => void;
  onRemove: (id: string) => void;
};

function createEmptyRow(): OrderRowValue {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    gsm: "",
    bf: "",
    inch: "",
    type: "",
    quantity: "",
  };
}

function OrderRow({
  index,
  row,
  gsmValues,
  bfValues,
  inchValues,
  typeValues,
  canRemove,
  onChange,
  onRemove,
}: OrderRowProps) {
  const [stock, setStock] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [effectivePrice, setEffectivePrice] = useState<number | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  const canCheck = useMemo(() => Boolean(row.gsm && row.bf && row.inch && row.type), [row.gsm, row.bf, row.inch, row.type]);

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
        const query = new URLSearchParams({ gsm: row.gsm, bf: row.bf, inch: row.inch, type: row.type }).toString();
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
  }, [canCheck, row.gsm, row.bf, row.inch, row.type]);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Order #{index + 1}</p>
        {canRemove ? (
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <select
          name="gsm"
          required
          value={row.gsm}
          onChange={(event) => onChange(row.id, "gsm", event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select GSM</option>
          {gsmValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          name="bf"
          required
          value={row.bf}
          onChange={(event) => onChange(row.id, "bf", event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select BF</option>
          {bfValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          name="inch"
          required
          value={row.inch}
          onChange={(event) => onChange(row.id, "inch", event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select Inch</option>
          {inchValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          name="type"
          required
          value={row.type}
          onChange={(event) => onChange(row.id, "type", event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select Type</option>
          {typeValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input
          type="number"
          name="quantity"
          min={1}
          required
          placeholder="Quantity"
          value={row.quantity}
          onChange={(event) => onChange(row.id, "quantity", event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="mt-3">
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
    </div>
  );
}

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
  const [rows, setRows] = useState<OrderRowValue[]>([createEmptyRow()]);

  const handleRowChange = (id: string, field: keyof Omit<OrderRowValue, "id">, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  };

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-3">
        {rows.map((row, index) => (
          <OrderRow
            key={row.id}
            index={index}
            row={row}
            gsmValues={gsmValues}
            bfValues={bfValues}
            inchValues={inchValues}
            typeValues={typeValues}
            canRemove={rows.length > 1}
            onChange={handleRowChange}
            onRemove={handleRemoveRow}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleAddRow}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Add More Order
        </button>
        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
          Submit Orders
        </button>
      </div>
    </form>
  );
}
