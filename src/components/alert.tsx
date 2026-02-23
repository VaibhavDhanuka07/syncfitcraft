type AlertProps = {
  message?: string;
  type: "success" | "error";
};

export function Alert({ message, type }: AlertProps) {
  if (!message) return null;

  const classes =
    type === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : "border-rose-300 bg-rose-50 text-rose-800";

  return <p className={`rounded-lg border px-3 py-2 text-sm ${classes}`}>{message}</p>;
}
