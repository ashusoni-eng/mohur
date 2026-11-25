import QRCode from "qrcode";

/** QR as a plain boolean matrix, so the same code can draw SVG and PNG. */
export function qrMatrix(text: string): { size: number; on: (r: number, c: number) => boolean } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  return { size: modules.size, on: (r, c) => r >= 0 && c >= 0 && r < modules.size && c < modules.size && !!modules.get(r, c) };
}

/** One path for every module: horizontal runs, so there are no hairline seams between cells. */
export function qrPath(text: string): { d: string; size: number } {
  const { size, on } = qrMatrix(text);
  let d = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (!on(r, c)) continue;
      let w = 1;
      while (on(r, c + w)) w++;
      d += `M${c} ${r}h${w}v1h-${w}z`;
      c += w;
    }
  return { d, size };
}
