import ExcelJS from "exceljs";

import { createPdfBuffer } from "@/lib/pdf";
import type { OrderStatus } from "@/lib/types";

export const EXPORTABLE_ORDER_STATUSES: OrderStatus[] = ["accepted", "approved", "partial", "partially_accepted"];

const exportableOrderStatusSet = new Set<OrderStatus>(EXPORTABLE_ORDER_STATUSES);

export type OrderExportItem = {
  requestedSpec: string;
  acceptedSpec: string;
  requestedQuantity: number;
  approvedQuantity: number;
  rejectedQuantity: number;
  unitPrice: number;
  lineTotal: number;
  itemStatus: string;
};

export type OrderExportData = {
  orderId: string;
  customerName: string;
  customerEmail: string;
  firmName: string | null;
  orderStatus: OrderStatus;
  createdAt: string;
  items: OrderExportItem[];
  totalApprovedQuantity: number;
  grandTotal: number;
};

export type OrderExportCheckItem = {
  itemStatus?: string | null;
  approvedQuantity?: number | null;
};

export function hasAcceptedOrderItems(items: OrderExportCheckItem[] = []) {
  return items.some((item) => {
    const status = item.itemStatus?.toLowerCase();
    return status === "accepted" || status === "approved" || status === "partially_accepted" || (item.approvedQuantity ?? 0) > 0;
  });
}

export function isOrderExportable(status: OrderStatus, items: OrderExportCheckItem[] = []) {
  return exportableOrderStatusSet.has(status) || hasAcceptedOrderItems(items);
}

function formatCurrency(value: number) {
  return `INR ${value.toFixed(2)}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const PDF_COLORS = {
  page: "#eff6ff",
  panel: "#ffffff",
  panelSoft: "#f8fafc",
  border: "#cbd5e1",
  heading: "#0f172a",
  muted: "#475569",
  accent: "#2563eb",
  success: "#166534",
  successSoft: "#dcfce7",
  warning: "#9a3412",
  warningSoft: "#ffedd5",
  danger: "#991b1b",
  dangerSoft: "#fee2e2",
  lightText: "#dbeafe",
};

function drawPageBackdrop(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_COLORS.page);
  doc.restore();
}

function drawRoundedPanel(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, fillColor = PDF_COLORS.panel) {
  doc.save();
  doc.roundedRect(x, y, width, height, 16).fillAndStroke(fillColor, PDF_COLORS.border);
  doc.restore();
}

function drawInfoCard(doc: PDFKit.PDFDocument, input: {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  value: string;
  meta?: string;
}) {
  drawRoundedPanel(doc, input.x, input.y, input.width, input.height);
  doc.fillColor(PDF_COLORS.accent).fontSize(9).text(input.label.toUpperCase(), input.x + 14, input.y + 12, {
    width: input.width - 28,
  });
  doc.fillColor(PDF_COLORS.heading).fontSize(13).text(input.value, input.x + 14, input.y + 28, {
    width: input.width - 28,
  });

  if (input.meta) {
    doc.fillColor(PDF_COLORS.muted).fontSize(9).text(input.meta, input.x + 14, input.y + 50, {
      width: input.width - 28,
    });
  }
}

function drawHeader(doc: PDFKit.PDFDocument, data: OrderExportData) {
  const x = doc.page.margins.left;
  const y = doc.page.margins.top;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const height = 108;
  const gradient = doc.linearGradient(x, y, x + width, y + height);
  gradient.stop(0, "#0f172a");
  gradient.stop(1, "#2563eb");

  doc.save();
  doc.roundedRect(x, y, width, height, 20).fill(gradient);
  doc.restore();

  doc.fillColor(PDF_COLORS.lightText).fontSize(9).text("SYNCFIT KRAFT", x + 20, y + 18, {
    characterSpacing: 1.8,
  });
  doc.fillColor("#ffffff").fontSize(24).text("Order Description", x + 20, y + 36);
  doc.fillColor(PDF_COLORS.lightText).fontSize(10).text("Accepted order summary with item-wise pricing and quantities", x + 20, y + 72);

  doc.fillColor("#ffffff").fontSize(10).text("ORDER", x + width - 118, y + 20, {
    width: 98,
    align: "right",
  });
  doc.fontSize(14).text(`#${data.orderId.slice(0, 8)}`, x + width - 150, y + 40, {
    width: 130,
    align: "right",
  });
  doc.fillColor(PDF_COLORS.lightText).fontSize(10).text(formatDate(data.createdAt), x + width - 160, y + 64, {
    width: 140,
    align: "right",
  });

  return y + height + 18;
}

function drawStatusBadge(doc: PDFKit.PDFDocument, status: string, x: number, y: number, width: number) {
  const normalized = status.toLowerCase();
  const palette =
    normalized === "accepted" || normalized === "approved"
      ? { bg: PDF_COLORS.successSoft, fg: PDF_COLORS.success }
      : normalized === "rejected"
        ? { bg: PDF_COLORS.dangerSoft, fg: PDF_COLORS.danger }
        : { bg: PDF_COLORS.warningSoft, fg: PDF_COLORS.warning };

  doc.save();
  doc.roundedRect(x, y, width, 20, 10).fill(palette.bg);
  doc.restore();
  doc.fillColor(palette.fg).fontSize(9).text(status.replaceAll("_", " "), x, y + 5, {
    width,
    align: "center",
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number, columns: Array<{ label: string; width: number }>) {
  let currentX = x;
  columns.forEach((column) => {
    doc.save();
    doc.roundedRect(currentX, y, column.width, 26, 8).fill(PDF_COLORS.heading);
    doc.restore();
    doc.fillColor("#ffffff").fontSize(9).text(column.label, currentX + 8, y + 8, {
      width: column.width - 16,
      align: "center",
    });
    currentX += column.width + 6;
  });

  return y + 34;
}

export async function createOrderExportWorkbook(data: OrderExportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Snycfit Kraft";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Order Summary");
  summarySheet.columns = [
    { width: 22 },
    { width: 42 },
  ];

  const summaryRows = [
    ["Order ID", data.orderId],
    ["Status", data.orderStatus],
    ["Created At", formatDate(data.createdAt)],
    ["Customer", data.customerName],
    ["Email", data.customerEmail],
    ["Firm Name", data.firmName ?? "-"],
    ["Approved Quantity", data.totalApprovedQuantity],
    ["Estimated Total", formatCurrency(data.grandTotal)],
  ];

  summarySheet.addRow(["Order Description Export"]);
  summarySheet.mergeCells("A1:B1");
  summarySheet.getCell("A1").font = { bold: true, size: 16 };
  summarySheet.getCell("A1").alignment = { vertical: "middle" };
  summarySheet.addRow([]);

  summaryRows.forEach(([label, value]) => {
    const row = summarySheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  });

  const itemsSheet = workbook.addWorksheet("Order Items");
  itemsSheet.columns = [
    { header: "Requested Spec", key: "requestedSpec", width: 20 },
    { header: "Accepted Spec", key: "acceptedSpec", width: 22 },
    { header: "Requested Qty", key: "requestedQuantity", width: 16 },
    { header: "Approved Qty", key: "approvedQuantity", width: 16 },
    { header: "Rejected Qty", key: "rejectedQuantity", width: 16 },
    { header: "Unit Price", key: "unitPrice", width: 14 },
    { header: "Line Total", key: "lineTotal", width: 14 },
    { header: "Item Status", key: "itemStatus", width: 16 },
  ];
  itemsSheet.getRow(1).font = { bold: true };

  data.items.forEach((item) => {
    itemsSheet.addRow({
      ...item,
      unitPrice: Number(item.unitPrice.toFixed(2)),
      lineTotal: Number(item.lineTotal.toFixed(2)),
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function createOrderExportPdf(data: OrderExportData) {
  return await createPdfBuffer((doc) => {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 40;

    drawPageBackdrop(doc);
    let y = drawHeader(doc, data);

    const cardGap = 12;
    const cardWidth = (contentWidth - cardGap) / 2;
    const topCardY = y;
    drawInfoCard(doc, {
      x: left,
      y: topCardY,
      width: cardWidth,
      height: 78,
      label: "Customer",
      value: data.customerName,
      meta: `${data.firmName ?? "No firm name"} | ${data.customerEmail}`,
    });
    drawInfoCard(doc, {
      x: left + cardWidth + cardGap,
      y: topCardY,
      width: cardWidth,
      height: 78,
      label: "Order Status",
      value: data.orderStatus.replaceAll("_", " "),
      meta: `Created ${formatDate(data.createdAt)}`,
    });

    const bottomCardY = topCardY + 90;
    drawInfoCard(doc, {
      x: left,
      y: bottomCardY,
      width: cardWidth,
      height: 78,
      label: "Approved Quantity",
      value: `${data.totalApprovedQuantity} reels`,
      meta: `${data.items.length} item(s) included in this export`,
    });
    drawInfoCard(doc, {
      x: left + cardWidth + cardGap,
      y: bottomCardY,
      width: cardWidth,
      height: 78,
      label: "Estimated Value",
      value: formatCurrency(data.grandTotal),
      meta: "Computed from approved quantity and discounted item price",
    });

    y = bottomCardY + 102;

    doc.fillColor(PDF_COLORS.accent).rect(left, y + 8, 18, 3).fill();
    doc.fillColor(PDF_COLORS.heading).fontSize(16).text("Accepted Item Breakdown", left + 26, y);
    doc.fillColor(PDF_COLORS.muted).fontSize(10).text("Each row shows requested specs, accepted specs, quantities, price, and status.", left, y + 22);
    y += 52;

    const columns = [
      { label: "Item", width: 42 },
      { label: "Requested", width: 104 },
      { label: "Accepted", width: 118 },
      { label: "Quantity", width: 78 },
      { label: "Value", width: 88 },
      { label: "Status", width: 63 },
    ];

    y = drawTableHeader(doc, left, y, columns);

    data.items.forEach((item, index) => {
      const rowHeight = 68;

      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        drawPageBackdrop(doc);
        y = doc.page.margins.top;
        doc.fillColor(PDF_COLORS.heading).fontSize(15).text("Accepted Item Breakdown", left, y);
        doc.fillColor(PDF_COLORS.muted).fontSize(9).text("Continued", left, y + 18);
        y = drawTableHeader(doc, left, y + 36, columns);
      }

      drawRoundedPanel(doc, left, y, contentWidth, rowHeight, index % 2 === 0 ? PDF_COLORS.panel : PDF_COLORS.panelSoft);

      const cells = {
        index: left,
        requested: left + 48,
        accepted: left + 158,
        qty: left + 282,
        value: left + 366,
        status: left + 460,
      };

      doc.fillColor(PDF_COLORS.heading).fontSize(11).text(String(index + 1).padStart(2, "0"), cells.index + 12, y + 24, {
        width: 20,
        align: "center",
      });
      doc.fillColor(PDF_COLORS.heading).fontSize(10).text(item.requestedSpec, cells.requested + 8, y + 12, {
        width: 88,
      });
      doc.fillColor(PDF_COLORS.heading).fontSize(10).text(item.acceptedSpec, cells.accepted + 8, y + 12, {
        width: 102,
      });
      doc.fillColor(PDF_COLORS.muted).fontSize(9).text(
        `Req ${item.requestedQuantity}\nApp ${item.approvedQuantity}\nRej ${item.rejectedQuantity}`,
        cells.qty + 8,
        y + 10,
        { width: 62 },
      );
      doc.fillColor(PDF_COLORS.heading).fontSize(9).text(
        `Unit ${formatCurrency(item.unitPrice)}\nLine ${formatCurrency(item.lineTotal)}`,
        cells.value + 8,
        y + 16,
        { width: 72 },
      );
      drawStatusBadge(doc, item.itemStatus, cells.status + 6, y + 24, 50);

      y += rowHeight + 10;
    });

    if (y + 92 > bottomLimit) {
      doc.addPage();
      drawPageBackdrop(doc);
      y = doc.page.margins.top;
    }

    drawRoundedPanel(doc, left, y, contentWidth, 84);
    doc.fillColor(PDF_COLORS.accent).fontSize(10).text("FINAL SUMMARY", left + 18, y + 14, {
      characterSpacing: 1.1,
    });
    doc.fillColor(PDF_COLORS.heading).fontSize(14).text(`${data.totalApprovedQuantity} approved reels`, left + 18, y + 32);
    doc.fillColor(PDF_COLORS.heading).fontSize(14).text(formatCurrency(data.grandTotal), left + 18, y + 52);
    doc.fillColor(PDF_COLORS.muted).fontSize(9).text(
      "This export is generated from the current accepted order details available in the platform.",
      left + 250,
      y + 30,
      { width: 240 },
    );
  }, { margin: 36, size: "A4" });
}
