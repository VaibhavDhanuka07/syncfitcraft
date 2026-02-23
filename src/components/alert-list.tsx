import { Alert } from "@/components/alert";

export function AlertList({ message, error }: { message?: string; error?: string }) {
  return (
    <div className="space-y-2">
      <Alert message={message} type="success" />
      <Alert message={error} type="error" />
    </div>
  );
}
