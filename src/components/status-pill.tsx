import type { AccountStatus, OrderItemStatus, OrderStatus } from "@/lib/types";

const styleMap: Record<OrderStatus | OrderItemStatus | AccountStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  partially_accepted: "bg-sky-100 text-sky-800",
  partial: "bg-sky-100 text-sky-800",
};

export function StatusPill({ status }: { status: OrderStatus | OrderItemStatus | AccountStatus }) {
  const normalized = status === "approved" ? "accepted" : status === "partially_accepted" ? "partial" : status;

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styleMap[status] ?? styleMap[normalized]}`}>
      {normalized.replaceAll("_", " ")}
    </span>
  );
}
