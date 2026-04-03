import path from "node:path";

import PDFDocument from "pdfkit";

export const PDF_FONT_PATH = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "compiled",
  "@vercel",
  "og",
  "noto-sans-v27-latin-regular.ttf",
);

export function createPdfDocument(options: PDFKit.PDFDocumentOptions = {}) {
  return new PDFDocument({
    font: PDF_FONT_PATH,
    ...options,
  });
}

export async function createPdfBuffer(
  render: (doc: PDFKit.PDFDocument) => void,
  options: PDFKit.PDFDocumentOptions = {},
) {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = createPdfDocument(options);
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error) => reject(error));

    try {
      render(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
