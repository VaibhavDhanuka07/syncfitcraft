import type { OrderItemStatus } from "@/lib/types";

export function userApprovalTemplate(name: string | null, approved: boolean) {
  const greeting = name ? `Hello ${name},` : "Hello,";
  const subject = approved ? "Your Account Has Been Approved" : "Account Registration Update";
  const body = approved
    ? "You can now login and place orders."
    : "Your account registration was not approved.";

  return {
    subject,
    html: `<p>${greeting}</p><p>${body}</p>`,
  };
}

export function orderDecisionTemplate(input: {
  customerName: string | null;
  orderId: string;
  itemRows: Array<{
    gsm: number;
    bf: number;
    inch: number;
    type: "GY" | "NS";
    requested: number;
    approved: number;
    status: OrderItemStatus;
  }>;
}) {
  const greeting = input.customerName ? `Hello ${input.customerName},` : "Hello,";

  const hasRejected = input.itemRows.some((row) => row.status === "rejected");
  const hasAccepted = input.itemRows.some((row) => row.status === "accepted" || row.status === "approved");

  const subject = hasAccepted && hasRejected
    ? "Your order was partially accepted"
    : hasAccepted
      ? "Your order has been accepted"
      : "Your order has been rejected";

  const rows = input.itemRows
    .map((row) => {
      const rejected = row.requested - row.approved;
      return `<tr>
        <td>${row.gsm}/${row.bf}/${row.inch}/${row.type}</td>
        <td>${row.requested}</td>
        <td>${row.approved}</td>
        <td>${rejected}</td>
        <td>${row.status.replaceAll("_", " ")}</td>
      </tr>`;
    })
    .join("");

  return {
    subject,
    html: `
      <p>${greeting}</p>
      <p>Order <strong>${input.orderId}</strong> has been updated.</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        <thead>
          <tr>
            <th>Product (GSM/BF/Inch/Type)</th>
            <th>Requested</th>
            <th>Approved</th>
            <th>Rejected</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `,
  };
}

export function orderPlacedAdminTemplate(input: {
  customerName: string | null;
  customerEmail: string;
  orderId: string;
  itemRows: Array<{ gsm: number; bf: number; inch: number; type: "GY" | "NS"; requested: number }>;
}) {
  const rows = input.itemRows
    .map(
      (row) =>
        `<tr><td>${row.gsm}/${row.bf}/${row.inch}/${row.type}</td><td>${row.requested}</td></tr>`,
    )
    .join("");

  return {
    subject: `New order placed: ${input.orderId}`,
    html: `
      <p>New order placed by ${input.customerName ?? input.customerEmail} (${input.customerEmail}).</p>
      <p>Order: <strong>${input.orderId}</strong></p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        <thead><tr><th>Product</th><th>Requested</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `,
  };
}
