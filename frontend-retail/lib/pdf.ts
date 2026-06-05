import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

export interface ReportMeta {
  label: string;
  value: string;
}

export interface ExportOptions {
  /** Document title (matches the dashboard). */
  title: string;
  /** Small uppercase eyebrow above the title. */
  eyebrow?: string;
  subtitle?: string;
  filename: string;
  /** Key/value chips shown under the header (filters, generated date, …). */
  meta?: ReportMeta[];
}

// A4 portrait in points.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36;
const HEADER_H = 104;
const FOOTER_H = 30;
const GAP = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BODY_BOTTOM = PAGE_H - MARGIN - FOOTER_H;

const INK: [number, number, number] = [11, 18, 32];
const EMERALD: [number, number, number] = [5, 150, 105];
const TEAL: [number, number, number] = [13, 148, 136];
const SLATE: [number, number, number] = [100, 116, 139];

function drawHeader(pdf: jsPDF, opts: ExportOptions) {
  // Dark brand band (mirrors the on-page PageHeader).
  pdf.setFillColor(...INK);
  pdf.rect(0, 0, PAGE_W, HEADER_H, "F");
  // Emerald → teal accent stripe along the left edge.
  pdf.setFillColor(...EMERALD);
  pdf.rect(0, 0, 4, HEADER_H, "F");

  // Eyebrow.
  let y = MARGIN + 6;
  if (opts.eyebrow) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(52, 211, 153);
    pdf.text(opts.eyebrow.toUpperCase(), MARGIN, y);
    y += 16;
  } else {
    y += 6;
  }

  // Title.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(19);
  pdf.setTextColor(255, 255, 255);
  pdf.text(opts.title, MARGIN, y);
  y += 16;

  // Subtitle.
  if (opts.subtitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(203, 213, 225);
    const lines = pdf.splitTextToSize(opts.subtitle, CONTENT_W - 150);
    pdf.text(lines.slice(0, 2), MARGIN, y);
  }

  // Wordmark, top-right.
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  const retail = "Retail";
  const analytics = "Analytics";
  const aW = pdf.getTextWidth(analytics);
  pdf.setTextColor(255, 255, 255);
  pdf.text(retail, PAGE_W - MARGIN - aW - pdf.getTextWidth(retail), MARGIN + 4);
  pdf.setTextColor(52, 211, 153);
  pdf.text(analytics, PAGE_W - MARGIN - aW, MARGIN + 4);
}

function drawMetaStrip(pdf: jsPDF, meta: ReportMeta[], y: number): number {
  pdf.setFontSize(8);
  let x = MARGIN;
  const rowY = y;
  for (const m of meta) {
    const text = `${m.label}: ${m.value}`;
    const w = pdf.getTextWidth(text) + 16;
    if (x + w > PAGE_W - MARGIN) break;
    pdf.setFillColor(241, 245, 249);
    pdf.roundedRect(x, rowY - 9, w, 15, 4, 4, "F");
    pdf.setTextColor(...SLATE);
    pdf.setFont("helvetica", "normal");
    pdf.text(text, x + 8, rowY + 1);
    x += w + 6;
  }
  return rowY + 16;
}

function drawFooter(pdf: jsPDF, page: number) {
  const y = PAGE_H - MARGIN + 4;
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, y - 12, PAGE_W - MARGIN, y - 12);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...SLATE);
  pdf.text("RetailAnalytics · ICESI · Procesamiento Distribuido de Datos · 2026-1", MARGIN, y);
  const p = `Página ${page}`;
  pdf.text(p, PAGE_W - MARGIN - pdf.getTextWidth(p), y);
}

/**
 * Render the `[data-report-section]` blocks inside `root` into a branded,
 * paginated A4 PDF. Sections are placed whole (never split unless taller than a
 * full page), so each "part" of the dashboard stays on one piece of paper.
 */
export async function exportReport(root: HTMLElement, opts: ExportOptions): Promise<void> {
  const found = Array.from(root.querySelectorAll<HTMLElement>("[data-report-section]"));
  const targets = found.length ? found : [root];

  const canvases: HTMLCanvasElement[] = [];
  for (const el of targets) {
    // Skip sections with nothing meaningful (e.g. collapsed export-only host).
    if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: el.scrollWidth,
    });
    canvases.push(canvas);
  }

  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  let page = 1;
  drawHeader(pdf, opts);
  drawFooter(pdf, page);
  let cursorY = MARGIN + HEADER_H + 14;
  if (opts.meta?.length) cursorY = drawMetaStrip(pdf, opts.meta, cursorY) + 6;

  const newPage = () => {
    pdf.addPage();
    page += 1;
    drawFooter(pdf, page);
    cursorY = MARGIN + 8;
  };

  const freshPageUsable = BODY_BOTTOM - (MARGIN + 8);
  for (const canvas of canvases) {
    const imgW = CONTENT_W;
    const imgH = (canvas.height / canvas.width) * imgW;
    const remaining = BODY_BOTTOM - cursorY;

    if (imgH <= remaining) {
      // Fits in the space left on the current page.
      pdf.addImage(canvas, "PNG", MARGIN, cursorY, imgW, imgH, undefined, "FAST");
      cursorY += imgH + GAP;
    } else if (imgH <= freshPageUsable && remaining < freshPageUsable * 0.5) {
      // Doesn't fit and little room is left → move the whole section to a fresh
      // page (keeps a short card intact instead of splitting near a boundary).
      newPage();
      pdf.addImage(canvas, "PNG", MARGIN, cursorY, imgW, imgH, undefined, "FAST");
      cursorY += imgH + GAP;
    } else {
      // Either taller than a page, or plenty of room is still free → slice
      // vertically across pages so paper isn't left half-empty.
      const pxPerPt = canvas.width / imgW;
      let sy = 0;
      while (sy < canvas.height) {
        if (cursorY > BODY_BOTTOM - 40) newPage();
        const availPt = BODY_BOTTOM - cursorY;
        const sliceH = Math.min(Math.floor(availPt * pxPerPt), canvas.height - sy);
        const tmp = document.createElement("canvas");
        tmp.width = canvas.width;
        tmp.height = sliceH;
        const ctx = tmp.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, sy, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const drawH = sliceH / pxPerPt;
        pdf.addImage(tmp, "PNG", MARGIN, cursorY, imgW, drawH, undefined, "FAST");
        sy += sliceH;
        cursorY += drawH + GAP;
      }
    }
  }

  pdf.save(opts.filename);
}
