type OrderExportLinksProps = {
  orderId: string;
  canExport: boolean;
};

export function OrderExportLinks({ orderId, canExport }: OrderExportLinksProps) {
  if (!canExport) {
    return null;
  }

  const baseHref = `/api/orders/${orderId}/export`;

  return (
    <div className="flex flex-wrap gap-2">
      <a
        className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
        href={`${baseHref}?format=pdf`}
      >
        Download PDF
      </a>
      <a
        className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500"
        href={`${baseHref}?format=xlsx`}
      >
        Download Excel
      </a>
    </div>
  );
}
