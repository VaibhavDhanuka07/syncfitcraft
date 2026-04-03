"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { orderDecisionTemplate, orderPlacedAdminTemplate, userApprovalTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { createClient } from "@/lib/supabase/server";
import type { OrderItemStatus, ProductType } from "@/lib/types";

type OrderEmailItemRow = {
  requested_gsm: number;
  requested_bf: number;
  requested_inch: number;
  requested_type: ProductType;
  quantity_requested: number;
  quantity_approved: number;
  item_status: "pending" | "accepted" | "rejected";
};

const PHONE_REGEX = /^[0-9]{10}$/;
const signupRateMap = new Map<string, { count: number; startMs: number }>();

function sanitizeText(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .trim()
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ");
}

function validatePasswordStrength(password: string) {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

function enforceSignupRateLimit(email: string) {
  const key = email.toLowerCase();
  const now = Date.now();
  const current = signupRateMap.get(key);

  if (!current || now - current.startMs > 10 * 60 * 1000) {
    signupRateMap.set(key, { count: 1, startMs: now });
    return;
  }

  if (current.count >= 5) {
    throw new Error("Too many registration attempts. Please try again later.");
  }

  current.count += 1;
  signupRateMap.set(key, current);
}

function parsePositiveNumber(value: FormDataEntryValue | null, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return parsed;
}

async function sendNotificationEmail(payload: { to: string; subject: string; html: string }) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!siteUrl) {
    await sendEmail(payload);
    return;
  }

  try {
    const response = await fetch(`${siteUrl}/api/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || "Notification API failed");
    }
  } catch {
    await sendEmail(payload);
  }
}

function revalidateAdminViews() {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/users");
  revalidatePath("/admin/messages");
  revalidatePath("/admin/announcements");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/products");
  revalidatePath("/admin/import-export");
  revalidatePath("/client");
  revalidatePath("/dashboard/special-request");
}

async function sendOrderStatusEmail(supabase: Awaited<ReturnType<typeof createClient>>, orderId: string) {
  const { data: order } = await supabase
    .from("orders")
    .select("id,user_id,status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name,email")
    .eq("id", order.user_id)
    .maybeSingle();

  if (!profile?.email) return;

  const { data: items } = await supabase
    .from("order_items")
    .select("requested_gsm,requested_bf,requested_inch,requested_type,quantity_requested,quantity_approved,item_status")
    .eq("order_id", orderId)
    .returns<OrderEmailItemRow[]>();

  const rows = (items ?? []).map((item) => ({
    gsm: item.requested_gsm,
    bf: item.requested_bf,
    inch: item.requested_inch,
    type: item.requested_type,
    requested: item.quantity_requested,
    approved: item.quantity_approved,
    status: item.item_status as OrderItemStatus,
  }));

  const template = orderDecisionTemplate({
    customerName: profile.name,
    orderId: order.id,
    itemRows: rows,
  });

  await sendNotificationEmail({
    to: profile.email,
    subject: template.subject,
    html: template.html,
  });
}

async function runOrderItemDecisionRpc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderItemId: string,
  decision: "accepted" | "rejected",
  approvedQty: number | null,
) {
  const candidates =
    decision === "rejected"
      ? ["rejected"]
      : approvedQty !== null
        ? ["accepted", "approved", "partially_accepted"]
        : ["accepted", "approved"];

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    const { data, error } = await supabase.rpc("process_order_item_decision", {
      p_order_item_id: orderItemId,
      p_decision: candidate,
      p_quantity_approved: approvedQty,
    });

    if (!error) {
      return { data, error: null };
    }

    const message = error.message ?? "Unable to process order item";
    if (message.toLowerCase().includes("invalid decision")) {
      lastError = new Error(message);
      continue;
    }

    return { data: null, error };
  }

  return {
    data: null,
    error: lastError ?? new Error("Unable to process order item"),
  };
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();

  if (!email || !password) {
    redirect("/login?error=Email+and+password+are+required");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=Login+failed");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("approval_status,status")
    .eq("id", user.id)
    .maybeSingle();

  const approval = profile?.approval_status ?? profile?.status;
  if (!profile || approval !== "approved") {
    await supabase.auth.signOut();
    if (approval === "rejected") {
      redirect("/rejected-account");
    }
    redirect("/pending-approval");
  }

  redirect("/");
}

export async function signUpAction(formData: FormData) {
  const firmName = sanitizeText(formData.get("firm_name"));
  const proprietorName = sanitizeText(formData.get("proprietor_name"));
  const fullName = sanitizeText(formData.get("full_name"));
  const gstNumber = sanitizeText(formData.get("gst_number"));
  const firmAddress = sanitizeText(formData.get("firm_address"));
  const phone1 = normalizePhone(sanitizeText(formData.get("phone1")));
  const phone2Raw = sanitizeText(formData.get("phone2"));
  const phone2 = phone2Raw ? normalizePhone(phone2Raw) : "";
  const email = sanitizeText(formData.get("email")).toLowerCase();
  const email2 = sanitizeText(formData.get("email2")).toLowerCase();
  const password = String(formData.get("password") ?? "").trim();

  if (!firmName || !proprietorName || !fullName || !firmAddress || !phone1 || !email || !password) {
    redirect("/login?error=Please+fill+all+required+business+fields");
  }

  if (!PHONE_REGEX.test(phone1) || (phone2 && !PHONE_REGEX.test(phone2))) {
    redirect("/login?error=Invalid+phone+number");
  }

  if (email2 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email2)) {
    redirect("/login?error=Invalid+secondary+email");
  }

  if (!validatePasswordStrength(password)) {
    redirect("/login?error=Password+must+be+8%2B+chars+with+upper+lower+number+special");
  }

  try {
    enforceSignupRateLimit(email);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Too many attempts";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();

  const { data: existingEmail } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingEmail) {
    redirect("/login?error=Email+already+registered");
  }

  const { data: existingFirm } = await supabase
    .from("profiles")
    .select("id")
    .ilike("firm_name", firmName)
    .maybeSingle();

  if (existingFirm) {
    redirect("/login?error=Firm+already+registered");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: fullName,
        firm_name: firmName,
        proprietor_name: proprietorName,
        full_name: fullName,
        gst_number: gstNumber || null,
        firm_address: firmAddress,
        phone1,
        phone2,
        email2,
      },
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  if (data.user?.id) {
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: data.user.id,
        name: fullName,
        email,
        role: "client",
        status: "pending",
        approval_status: "pending",
        firm_name: firmName,
        proprietor_name: proprietorName,
        full_name: fullName,
        gst_number: gstNumber || null,
        firm_address: firmAddress,
        phone1,
        phone2: phone2 || null,
        email2: email2 || null,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      redirect(`/login?error=${encodeURIComponent(profileError.message)}`);
    }
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .eq("approval_status", "approved");

  for (const admin of admins ?? []) {
    if (!admin.email) continue;
    await sendNotificationEmail({
      to: admin.email,
      subject: "New Customer Registration Pending Approval",
      html: `<p>New business registration submitted.</p><p><strong>Firm:</strong> ${firmName}<br/><strong>Proprietor:</strong> ${proprietorName}<br/><strong>Name:</strong> ${fullName}<br/><strong>GST:</strong> ${gstNumber || "-"}<br/><strong>Phone:</strong> ${phone1}<br/><strong>Email:</strong> ${email}</p>`,
    });
  }

  redirect("/login?message=Account+created.+Await+admin+approval.");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?message=You+have+been+logged+out");
}

export async function addOrUpdateProductAction(formData: FormData) {
  const { supabase } = await requireRole("admin");

  let gsm: number;
  let bf: number;
  let inch: number;
  let stock: number;
  const type = String(formData.get("type") ?? "GY").trim().toUpperCase();
  const price = Number(formData.get("price") ?? 0);
  const discount = Number(formData.get("discount") ?? 0);
  const isActive = String(formData.get("is_active") ?? "true") === "true";
  const lowStockThreshold = Number(formData.get("low_stock_threshold") ?? 10);
  const imageUrl = String(formData.get("image_url") ?? "").trim() || null;
  try {
    gsm = parsePositiveNumber(formData.get("gsm"), "GSM");
    bf = parsePositiveNumber(formData.get("bf"), "BF");
    inch = parsePositiveNumber(formData.get("inch"), "Inch");
    stock = parsePositiveNumber(formData.get("stock"), "Stock");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid input";
    redirect(`/admin/products?error=${encodeURIComponent(message)}`);
  }

  if (!["GY", "NS"].includes(type)) {
    redirect("/admin/products?error=Invalid+product+type");
  }

  if (Number.isNaN(price) || Number.isNaN(discount) || Number.isNaN(lowStockThreshold) || price < 0 || discount < 0 || lowStockThreshold < 0) {
    redirect("/admin/products?error=Invalid+price+discount+or+threshold");
  }

  const { error } = await supabase.from("products").upsert(
    {
      gsm,
      bf,
      inch,
      type,
      stock,
      available_reels: stock,
      price,
      discount,
      is_active: isActive,
      low_stock_threshold: lowStockThreshold,
      image_url: imageUrl,
    },
    {
      onConflict: "gsm,bf,inch,type",
      ignoreDuplicates: false,
    },
  );

  if (error) {
    redirect(`/admin/products?error=${encodeURIComponent(error.message)}`);
  }

  revalidateAdminViews();
  redirect("/admin/products?message=Product+saved");
}

export async function restockProductAction(formData: FormData) {
  const { supabase } = await requireRole("admin");

  const productId = String(formData.get("product_id") ?? "").trim();
  let incrementBy: number;
  try {
    incrementBy = parsePositiveNumber(formData.get("increment_by"), "Restock quantity");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid input";
    redirect(`/admin/products?error=${encodeURIComponent(message)}`);
  }

  const { data: product } = await supabase
    .from("products")
    .select("id,stock")
    .eq("id", productId)
    .maybeSingle();

  if (!product) {
    redirect("/admin/products?error=Product+not+found");
  }

  const { error } = await supabase
    .from("products")
    .update({ stock: product.stock + incrementBy, available_reels: product.stock + incrementBy })
    .eq("id", productId);

  if (error) {
    redirect(`/admin/products?error=${encodeURIComponent(error.message)}`);
  }

  revalidateAdminViews();
  redirect("/admin/products?message=Stock+updated");
}

export async function updateProductAdminAction(formData: FormData) {
  const { supabase } = await requireRole("admin");

  const productId = String(formData.get("product_id") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const discount = Number(formData.get("discount") ?? 0);
  const stock = Number(formData.get("stock") ?? 0);
  const isActive = String(formData.get("is_active") ?? "false") === "true";
  const lowStockThreshold = Number(formData.get("low_stock_threshold") ?? 10);

  if (!productId || [price, discount, stock, lowStockThreshold].some((v) => Number.isNaN(v) || v < 0)) {
    redirect("/admin/products?error=Invalid+product+update");
  }

  const { error } = await supabase
    .from("products")
    .update({
      price,
      discount,
      stock,
      available_reels: stock,
      is_active: isActive,
      low_stock_threshold: lowStockThreshold,
    })
    .eq("id", productId);

  if (error) {
    redirect(`/admin/products?error=${encodeURIComponent(error.message)}`);
  }

  revalidateAdminViews();
  redirect("/admin/products?message=Product+updated");
}

export async function deleteProductAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const productId = String(formData.get("product_id") ?? "").trim();

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) {
    redirect(`/admin/products?error=${encodeURIComponent(error.message)}`);
  }

  revalidateAdminViews();
  redirect("/admin/products?message=Product+deleted");
}

export async function approveUserAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const userId = String(formData.get("user_id") ?? "").trim();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email,full_name")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ status: "approved", approval_status: "approved" })
    .eq("id", userId);
  if (error) {
    redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }

  if (profile?.email) {
    const template = userApprovalTemplate(profile.full_name, true);
    await sendNotificationEmail({ to: profile.email, subject: template.subject, html: template.html });
  }

  revalidateAdminViews();
  redirect("/admin/users?message=User+approved");
}

export async function rejectUserAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const userId = String(formData.get("user_id") ?? "").trim();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email,full_name")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ status: "rejected", approval_status: "rejected" })
    .eq("id", userId);
  if (error) {
    redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }

  if (profile?.email) {
    const template = userApprovalTemplate(profile.full_name, false);
    await sendNotificationEmail({ to: profile.email, subject: template.subject, html: template.html });
  }

  revalidateAdminViews();
  redirect("/admin/users?message=User+rejected");
}

export async function processOrderItemAction(formData: FormData) {
  const { supabase } = await requireRole("admin");

  const orderItemId = String(formData.get("order_item_id") ?? "").trim();
  let decision = String(formData.get("decision") ?? "").trim().toLowerCase();
  if (decision === "approved") decision = "accepted";
  if (decision === "partially_accepted") decision = "accepted";
  const approvedQtyRaw = formData.get("approved_qty");
  const approvedQty = approvedQtyRaw ? Number(approvedQtyRaw) : null;

  const { data, error } = await runOrderItemDecisionRpc(
    supabase,
    orderItemId,
    decision === "rejected" ? "rejected" : "accepted",
    approvedQty,
  );

  if (error || !Array.isArray(data) || !data[0]?.order_id) {
    const message = error?.message ?? "Unable to process order item";
    redirect(`/admin/orders?error=${encodeURIComponent(message)}`);
  }

  await sendOrderStatusEmail(supabase, data[0].order_id as string);

  revalidateAdminViews();
  redirect("/admin/orders?message=Order+item+updated");
}

export async function changeOrderItemSpecAction(formData: FormData) {
  const { supabase } = await requireRole("admin");

  const orderItemId = String(formData.get("order_item_id") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim().toUpperCase();
  let gsm: number;
  let bf: number;
  let inch: number;

  try {
    gsm = parsePositiveNumber(formData.get("gsm"), "GSM");
    bf = parsePositiveNumber(formData.get("bf"), "BF");
    inch = parsePositiveNumber(formData.get("inch"), "Inch");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid spec";
    redirect(`/admin/orders?error=${encodeURIComponent(message)}`);
  }

  if (!["GY", "NS"].includes(type)) {
    redirect("/admin/orders?error=Invalid+type");
  }

  const { data: orderItem } = await supabase
    .from("order_items")
    .select("id,order_id,item_status")
    .eq("id", orderItemId)
    .maybeSingle();

  if (!orderItem) {
    redirect("/admin/orders?error=Order+item+not+found");
  }

  if (orderItem.item_status !== "pending") {
    redirect("/admin/orders?error=Processed+items+cannot+be+changed");
  }

  const { data: replacementProducts } = await supabase
    .from("products")
    .select("id,gsm,bf,inch,size,type")
    .eq("gsm", gsm)
    .eq("bf", bf)
    .eq("type", type)
    .eq("is_active", true)
    .returns<Array<{ id: string; gsm: number; bf: number; inch: number | null; size: number | null; type: string }>>();

  const replacementProduct =
    (replacementProducts ?? []).find((product) => product.inch === inch || product.size === inch) ?? null;

  if (!replacementProduct) {
    redirect("/admin/orders?error=Replacement+product+combination+not+found");
  }

  const { error: updateItemError } = await supabase
    .from("order_items")
    .update({ product_id: replacementProduct.id })
    .eq("id", orderItemId);

  if (updateItemError) {
    redirect(`/admin/orders?error=${encodeURIComponent(updateItemError.message)}`);
  }

  const { data: updatedItem } = await supabase
    .from("order_items")
    .select("product_id")
    .eq("id", orderItemId)
    .maybeSingle();

  if (!updatedItem || updatedItem.product_id !== replacementProduct.id) {
    redirect("/admin/orders?error=Failed+to+apply+spec+change");
  }

  const { count: orderItemCount } = await supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderItem.order_id);

  if ((orderItemCount ?? 0) === 1) {
    await supabase
      .from("orders")
      .update({ gsm: replacementProduct.gsm, bf: replacementProduct.bf, inch: replacementProduct.inch })
      .eq("id", orderItem.order_id);
  }

  revalidateAdminViews();
  redirect("/admin/orders?message=Order+item+specification+updated");
}

export async function processFullOrderAction(formData: FormData) {
  const { supabase } = await requireRole("admin");

  const orderId = String(formData.get("order_id") ?? "").trim();
  let decision = String(formData.get("decision") ?? "").trim().toLowerCase();
  if (decision === "approved") decision = "accepted";
  if (decision === "accept") decision = "accepted";

  if (!orderId || !["accepted", "rejected"].includes(decision)) {
    redirect("/admin/orders?error=Invalid+request");
  }

  const { data: pendingItems } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "pending");

  for (const item of pendingItems ?? []) {
    const { error } = await runOrderItemDecisionRpc(
      supabase,
      item.id,
      decision === "rejected" ? "rejected" : "accepted",
      decision === "accepted" ? null : 0,
    );

    if (error) {
      const message = error.message.includes("Insufficient stock") ? "Insufficient stock" : error.message;
      redirect(`/admin/orders?error=${encodeURIComponent(message)}`);
    }
  }

  await sendOrderStatusEmail(supabase, orderId);

  revalidateAdminViews();
  redirect(`/admin/orders?message=Order+${decision}`);
}

export async function acceptOrderWithSpecChangesAction(formData: FormData) {
  const { supabase } = await requireRole("admin");

  const orderId = String(formData.get("order_id") ?? "").trim();
  const orderItemIds = formData.getAll("order_item_id").map((value) => String(value).trim());
  const gsms = formData.getAll("gsm").map((value) => Number(value));
  const bfs = formData.getAll("bf").map((value) => Number(value));
  const inches = formData.getAll("inch").map((value) => Number(value));
  const types = formData.getAll("type").map((value) => String(value).trim().toUpperCase());
  const approvedQtys = formData.getAll("approved_qty").map((value) => Number(value));

  if (!orderId || !orderItemIds.length) {
    redirect("/admin/orders?error=Invalid+accept+request");
  }

  const { data: pendingItems } = await supabase
    .from("order_items")
    .select("id,order_id,quantity_requested,item_status")
    .eq("order_id", orderId)
    .eq("item_status", "pending");

  const pendingById = new Map((pendingItems ?? []).map((item) => [item.id, item]));

  let firstAcceptedSpec: { gsm: number; bf: number; inch: number } | null = null;

  for (let index = 0; index < orderItemIds.length; index += 1) {
    const orderItemId = orderItemIds[index];
    const pendingItem = pendingById.get(orderItemId);
    if (!pendingItem) continue;

    const gsm = gsms[index];
    const bf = bfs[index];
    const inch = inches[index];
    const type = types[index];
    const approvedQty = approvedQtys[index];

    if (
      !Number.isInteger(gsm) ||
      !Number.isInteger(bf) ||
      !Number.isInteger(inch) ||
      !Number.isInteger(approvedQty) ||
      approvedQty <= 0 ||
      approvedQty > pendingItem.quantity_requested ||
      !["GY", "NS"].includes(type)
    ) {
      redirect("/admin/orders?error=Invalid+spec+or+quantity+in+accept+form");
    }

    const { data: directAcceptData, error } = await supabase.rpc("admin_accept_item_with_spec", {
      p_order_item_id: orderItemId,
      p_gsm: gsm,
      p_bf: bf,
      p_inch: inch,
      p_type: type,
      p_quantity_approved: approvedQty,
    });

    if (!firstAcceptedSpec) {
      firstAcceptedSpec = { gsm, bf, inch };
    }

    if (!error && directAcceptData) {
      continue;
    }

    const fallbackErrorMessage = (error as { message?: string } | null)?.message ?? "";
    if (
      fallbackErrorMessage.toLowerCase().includes("function public.admin_accept_item_with_spec") ||
      fallbackErrorMessage.toLowerCase().includes("does not exist")
    ) {
      const { data: replacementProducts } = await supabase
        .from("products")
        .select("id,gsm,bf,inch,size,type")
        .eq("gsm", gsm)
        .eq("bf", bf)
        .eq("type", type)
        .eq("is_active", true)
        .returns<Array<{ id: string; gsm: number; bf: number; inch: number | null; size: number | null; type: string }>>();

      const replacementProduct =
        (replacementProducts ?? []).find((product) => product.inch === inch || product.size === inch) ?? null;

      if (!replacementProduct) {
        redirect("/admin/orders?error=Replacement+product+combination+not+found");
      }

      const { error: updateItemError } = await supabase
        .from("order_items")
        .update({ product_id: replacementProduct.id })
        .eq("id", orderItemId);

      if (updateItemError) {
        redirect(`/admin/orders?error=${encodeURIComponent(updateItemError.message)}`);
      }

      const { data: updatedItem } = await supabase
        .from("order_items")
        .select("product_id")
        .eq("id", orderItemId)
        .maybeSingle();

      if (!updatedItem || updatedItem.product_id !== replacementProduct.id) {
        redirect("/admin/orders?error=Failed+to+apply+spec+change");
      }

      const { error: fallbackDecisionError } = await runOrderItemDecisionRpc(supabase, orderItemId, "accepted", approvedQty);
      if (fallbackDecisionError) {
        const message = fallbackDecisionError.message.includes("Insufficient stock")
          ? "Insufficient stock"
          : fallbackDecisionError.message;
        redirect(`/admin/orders?error=${encodeURIComponent(message)}`);
      }
      continue;
    }

    const err = error as { message?: string } | null;
    const message = (err?.message ?? "").includes("Insufficient stock") ? "Insufficient stock" : err?.message ?? "Unable to accept item";
    redirect(`/admin/orders?error=${encodeURIComponent(message)}`);
  }

  if (firstAcceptedSpec) {
    await supabase
      .from("orders")
      .update({
        gsm: firstAcceptedSpec.gsm,
        bf: firstAcceptedSpec.bf,
        inch: firstAcceptedSpec.inch,
      })
      .eq("id", orderId);
  }

  await sendOrderStatusEmail(supabase, orderId);
  revalidateAdminViews();
  redirect("/admin/orders?message=Order+accepted+with+spec+updates");
}

export async function createOrderAction(formData: FormData) {
  const { supabase, user, profile } = await requireRole("client");

  const gsmEntries = formData.getAll("gsm");
  const bfEntries = formData.getAll("bf");
  const inchEntries = formData.getAll("inch");
  const typeEntries = formData.getAll("type");
  const quantityEntries = formData.getAll("quantity");

  const rowCount = Math.max(
    gsmEntries.length,
    bfEntries.length,
    inchEntries.length,
    typeEntries.length,
    quantityEntries.length,
  );

  if (rowCount <= 0) {
    redirect("/client?error=No+order+items+provided");
  }

  if (
    gsmEntries.length !== rowCount ||
    bfEntries.length !== rowCount ||
    inchEntries.length !== rowCount ||
    typeEntries.length !== rowCount ||
    quantityEntries.length !== rowCount
  ) {
    redirect("/client?error=Order+rows+are+incomplete");
  }

  const orderRows: Array<{ gsm: number; bf: number; inch: number; type: ProductType; quantity: number }> = [];
  for (let index = 0; index < rowCount; index += 1) {
    let gsm: number;
    let bf: number;
    let inch: number;
    let quantity: number;
    const type = String(typeEntries[index] ?? "").trim().toUpperCase();
    try {
      gsm = parsePositiveNumber(gsmEntries[index], "GSM");
      bf = parsePositiveNumber(bfEntries[index], "BF");
      inch = parsePositiveNumber(inchEntries[index], "Inch");
      quantity = parsePositiveNumber(quantityEntries[index], "Quantity");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid input";
      redirect(`/client?error=${encodeURIComponent(`Item ${index + 1}: ${message}`)}`);
    }

    if (!["GY", "NS"].includes(type)) {
      redirect(`/client?error=${encodeURIComponent(`Item ${index + 1}: Select valid type`)}`);
    }

    orderRows.push({ gsm, bf, inch, type: type as ProductType, quantity });
  }

  const { data: newOrderId, error } = await supabase.rpc("create_order_with_items_v3", {
    p_rows: orderRows as unknown as object,
  });

  if (error || !newOrderId) {
    redirect(`/client?error=${encodeURIComponent(error?.message ?? "Unable to create order")}`);
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .eq("approval_status", "approved");

  const template = orderPlacedAdminTemplate({
    customerName: profile.name,
    customerEmail: user.email ?? profile.email,
    orderId: String(newOrderId),
    itemRows: orderRows.map((row) => ({
      gsm: row.gsm,
      bf: row.bf,
      inch: row.inch,
      type: row.type,
      requested: row.quantity,
    })),
  });

  for (const admin of admins ?? []) {
    if (!admin.email) continue;
    await sendNotificationEmail({ to: admin.email, subject: template.subject, html: template.html });
  }

  revalidateAdminViews();
  redirect(`/client?message=${encodeURIComponent(`Order submitted with ${orderRows.length} item(s)`)}`);
}

export async function createSpecialRequestAction(formData: FormData) {
  const { supabase, user, profile } = await requireRole("client");
  const message = sanitizeText(formData.get("message"));

  if (!message || message.length < 10) {
    redirect("/dashboard/special-request?error=Please+enter+at+least+10+characters");
  }

  const { error } = await supabase.from("special_requests").insert({
    user_id: user.id,
    message,
    status: "new",
  });

  if (error) {
    redirect(`/dashboard/special-request?error=${encodeURIComponent(error.message)}`);
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .eq("approval_status", "approved");

  for (const admin of admins ?? []) {
    if (!admin.email) continue;
    await sendNotificationEmail({
      to: admin.email,
      subject: "New Special Product Request Received",
      html: `<p>A special request has been submitted.</p><p><strong>Firm:</strong> ${profile.firm_name}<br/><strong>User:</strong> ${profile.full_name}<br/><strong>Email:</strong> ${profile.email}<br/><strong>Message:</strong><br/>${message}</p>`,
    });
  }

  revalidatePath("/dashboard/special-request");
  revalidatePath("/admin/messages");
  redirect("/dashboard/special-request?message=Request+submitted+successfully");
}

export async function updateSpecialRequestStatusAction(formData: FormData) {
  const { supabase } = await requireRole("admin");

  const requestId = String(formData.get("request_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim().toLowerCase();
  const replyRaw = formData.get("reply");
  const reply = replyRaw ? sanitizeText(replyRaw) : "";

  if (!requestId || !["seen", "responded"].includes(status)) {
    redirect("/admin/messages?error=Invalid+request+update");
  }

  const payload: { status: string; reply?: string } = { status };
  if (status === "responded") {
    payload.reply = reply || "Thank you. Our team has reviewed your request.";
  }

  const { error } = await supabase.from("special_requests").update(payload).eq("id", requestId);
  if (error) {
    redirect(`/admin/messages?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/messages");
  revalidatePath("/dashboard/special-request");
  redirect("/admin/messages?message=Message+status+updated");
}

export async function updateClientBannerAction(formData: FormData) {
  const { supabase, user } = await requireRole("admin");
  const message = sanitizeText(formData.get("message"));

  const { error } = await supabase.from("platform_messages").upsert(
    {
      id: "client_order_banner",
      message,
      updated_by: user.id,
    },
    { onConflict: "id" },
  );

  if (error) {
    redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/settings");
  revalidatePath("/client");
  redirect("/admin/settings?message=Client+banner+updated");
}
