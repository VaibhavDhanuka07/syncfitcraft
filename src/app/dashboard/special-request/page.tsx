import Link from "next/link";

import { createSpecialRequestAction } from "@/app/actions";
import { Alert } from "@/components/alert";
import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type SpecialRequestRow = {
  id: string;
  message: string;
  reply: string | null;
  status: "new" | "seen" | "responded";
  created_at: string;
};

export default async function SpecialRequestPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, profile } = await requireRole("client");

  const { data: requests } = await supabase
    .from("special_requests")
    .select("id,message,reply,status,created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .returns<SpecialRequestRow[]>();

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <Shell title="Special Product Request" subtitle="Send your custom product requirement to admin">
      <div className="space-y-3">
        <Alert message={message} type="success" />
        <Alert message={error} type="error" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">New Request</h2>
        <form action={createSpecialRequestAction} className="mt-4 space-y-3">
          <textarea
            name="message"
            required
            minLength={10}
            rows={5}
            placeholder="Describe required products/specifications..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-3">
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              Submit Request
            </button>
            <Link href="/client" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Back to Orders
            </Link>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Request History</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Message</th>
                <th className="py-2">Status</th>
                <th className="py-2">Reply</th>
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {(requests ?? []).map((request) => (
                <tr key={request.id} className="border-b border-slate-100">
                  <td className="py-2">{request.message}</td>
                  <td className="py-2">{request.status}</td>
                  <td className="py-2">{request.reply ?? "-"}</td>
                  <td className="py-2">{new Date(request.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}

