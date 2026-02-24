import { redirect } from "next/navigation";

import { signInAction, signOutAction, signUpAction } from "@/app/actions";
import { Alert } from "@/components/alert";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileStatus: "pending" | "approved" | "rejected" | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("approval_status,status")
      .eq("id", user.id)
      .maybeSingle();
    profileStatus = (profile?.approval_status ?? profile?.status ?? null) as "pending" | "approved" | "rejected" | null;

    if (profileStatus === "approved") {
      redirect("/");
    }
  }

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-2">
          <div className="relative overflow-hidden bg-slate-950 p-8 text-slate-50 lg:p-10">
            <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-24 bottom-10 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />

            <h1 className="text-[clamp(3rem,7vw,4rem)] font-bold leading-[0.95] tracking-[0.02em] text-white">
              <span className="hero-brand-chip">SYNCFIT KRAFT</span>
            </h1>
            <p className="mt-5 text-base font-semibold text-slate-200 md:text-lg">
              Inventory and Order Management
            </p>

            <figure className="hero-reel-card fade-in-up mt-9">
              <video
                className="hero-reel-image h-auto w-full"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-label="Kraft paper reel showcase video"
              >
                <source src="/login-hero-reel.mp4" type="video/mp4" />
              </video>
            </figure>
          </div>
          <div className="space-y-6 p-8 lg:p-10">
            <Alert message={message} type="success" />
            <Alert message={error} type="error" />

            {user ? (
              <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <p>
                  {profileStatus === "rejected"
                    ? "Your account was rejected by admin."
                    : "Your account is pending admin approval."}
                </p>
                <form action={signOutAction}>
                  <button className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <>
                <form action={signInAction} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <h2 className="text-lg font-semibold">Sign in</h2>
                  <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="password"
                    name="password"
                    placeholder="Password"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                    Sign in
                  </button>
                </form>

                <form action={signUpAction} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <h2 className="text-lg font-semibold">Create account</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input type="text" name="firm_name" placeholder="Firm Name *" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input type="text" name="proprietor_name" placeholder="Proprietor Name *" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input type="text" name="full_name" placeholder="Your Name *" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input
                      type="text"
                      name="gst_number"
                      placeholder="GST Number (optional)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input type="text" name="firm_address" placeholder="Firm Address *" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
                    <input type="tel" name="phone1" placeholder="Phone 1 *" required pattern="^[0-9]{10}$" title="Enter 10 digit phone number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input type="tel" name="phone2" placeholder="Phone 2 (optional)" pattern="^[0-9]{10}$" title="Enter 10 digit phone number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input type="email" name="email" placeholder="Email *" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input type="email" name="email2" placeholder="Email 2 (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input
                      type="password"
                      name="password"
                      placeholder="Password *"
                      required
                      minLength={8}
                      title="Use at least 8 characters with upper, lower, number, and special character."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Password must include uppercase, lowercase, number, and special character.
                  </p>
                  <button className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                    Sign up
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
