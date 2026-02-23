import { redirect } from "next/navigation";

import type { AppRole, Profile } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function getCurrentProfile() {
  const { supabase, user } = await requireUser();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id,name,email,firm_name,proprietor_name,full_name,gst_number,firm_address,phone1,phone2,email2,role,status,approval_status,created_at")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (profileData as Profile | null) ?? null;

  if (!profile) {
    redirect("/login?error=Profile+not+found.+Run+Supabase+migration+and+relogin");
  }

  const approval = profile.approval_status ?? profile.status;

  if (approval !== "approved") {
    if (approval === "rejected") {
      redirect("/rejected-account");
    }
    redirect("/pending-approval");
  }

  return { supabase, user, profile };
}

export async function requireRole(role: AppRole) {
  const { supabase, user, profile } = await getCurrentProfile();

  if (profile.role !== role) {
    redirect("/forbidden");
  }

  return { supabase, user, profile };
}
