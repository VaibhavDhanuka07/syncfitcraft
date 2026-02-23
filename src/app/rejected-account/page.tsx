import { signOutAction } from "@/app/actions";

export default function RejectedAccountPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
      <section className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-rose-700">Account Registration Update</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account registration was not approved.
        </p>
        <form action={signOutAction} className="mt-6">
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}

