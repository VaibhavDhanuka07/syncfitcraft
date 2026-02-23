import Link from "next/link";
import { ReactNode } from "react";

import { signOutAction } from "@/app/actions";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/announcements", label: "Announcements" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/import-export", label: "Import / Export" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminShell({
  title,
  subtitle,
  currentPath,
  children,
}: {
  title: string;
  subtitle: string;
  currentPath: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6 lg:grid-cols-[230px_1fr] lg:px-8">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">SyncFit Kraft</p>
          <h2 className="mt-1 text-lg font-semibold">Admin Panel</h2>
          <nav className="mt-5 space-y-1">
            {navItems.map((item) => {
              const active = currentPath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <form action={signOutAction} className="mt-6">
            <button className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </aside>

        <section className="space-y-4">
          <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-slate-600">{subtitle}</p>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
