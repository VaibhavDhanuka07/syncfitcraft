import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isPublicApprovalRoute =
    pathname.startsWith("/pending-approval") ||
    pathname.startsWith("/rejected-account") ||
    pathname.startsWith("/rejected") ||
    pathname.startsWith("/login");

  if (user && !pathname.startsWith("/api/")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("approval_status,status")
      .eq("id", user.id)
      .maybeSingle();

    const approval = profile?.approval_status ?? profile?.status;
    if (approval === "pending" && !isPublicApprovalRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending-approval";
      return NextResponse.redirect(url);
    }

    if (approval === "rejected" && !isPublicApprovalRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/rejected-account";
      return NextResponse.redirect(url);
    }
  }

  if (isAdminRoute) {
    if (!user) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role,status,approval_status")
      .eq("id", user.id)
      .maybeSingle();

    const approval = profile?.approval_status ?? profile?.status;
    if (!profile || profile.role !== "admin" || approval !== "approved") {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/forbidden";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
