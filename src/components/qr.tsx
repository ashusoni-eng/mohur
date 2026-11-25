"use client";
import { useRef } from "react";
import { Download } from "lucide-react";
import { Button } from "./ui";

export function Qr({ d, size, px, className = "" }: { d: string; size: number; px?: number; className?: string }) {
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} width={px} height={px} className={className} role="img" aria-label="UPI QR code" shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" />
      <path d={d} fill="#06241c" />
    </svg>
  );
}

export function DownloadQr({ d, size, name, caption, label = "Download PNG" }: { d: string; size: number; name: string; caption: string[]; label?: string }) {
  const a = useRef<HTMLAnchorElement>(null);
  const go = () => {
    const k = Math.floor(960 / (size + 8));
    const W = (size + 8) * k, H = W + 70 + caption.length * 52;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    g.save(); g.translate(4 * k, 4 * k); g.scale(k, k); g.fillStyle = "#06241c"; g.fill(new Path2D(d)); g.restore();
    g.textAlign = "center";
    caption.forEach((t, i) => {
      g.font = i === 0 ? "600 46px 'Hanken Grotesk Variable', sans-serif" : "400 30px 'Hanken Grotesk Variable', sans-serif";
      g.fillStyle = i === 0 ? "#06241c" : "#43564e";
      g.fillText(t, W / 2, W + 34 + i * 52, W - 60);
    });
    a.current!.href = c.toDataURL("image/png");
    a.current!.download = `${name}.png`;
    a.current!.click();
  };
  return <><a ref={a} hidden /><Button variant="quiet" onClick={go}><Download size={16} />{label}</Button></>;
}
