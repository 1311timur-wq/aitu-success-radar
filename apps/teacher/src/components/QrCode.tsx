// Crisp, scalable QR code as one SVG path (no canvas, no images, works with CSP script-src 'self').
import { useMemo } from 'react';
import qrcode from '../vendor/qrcode.mjs';

export function QrCode({ value, size = 240, label, level = 'M' }: { value: string; size?: number; label: string; level?: 'L' | 'M' | 'Q' | 'H' }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, level);
    qr.addData(value, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) path += `M${c + 4},${r + 4}h1v1h-1z`;
    }
    return { d: path, n: count + 8 }; // 4-module quiet zone on every side
  }, [value, level]);
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
