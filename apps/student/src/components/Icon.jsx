// Icon set written for this project: inline 24x24 SVG stroke paths (no external icon font or library).
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  user: ['M4 21c0-4 3.6-7 8-7s8 3 8 7', 'c:12,8,4'],
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21a2 2 0 0 0 4 0',
  calendar: ['M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 9.5h18M8 2.5v3M16 2.5v3', 'M7 13.5h4M7 17h8'],
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  clipboard: ['M7 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-1M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z', 'M9 11h.01M9 15.5h.01M12.5 11H16M12.5 15.5H16'],
  route: ['M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5', 'c:6,19,2.2', 'c:18,5,2.2'],
  globe: ['M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18', 'c:12,12,9'],
  sun: ['M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4', 'c:12,12,3.8'],
  lock: ['M8 11V8a4 4 0 0 1 8 0v3', 'r:5,11,14,10,3'],
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  chat: 'M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 20.5l1.5-4.7A8.5 8.5 0 1 1 21 11.5z',
  search: ['M20.5 20.5 16.8 16.8', 'c:11,11,7'],
  chevR: 'M9 5l7 7-7 7', chevL: 'M15 5l-7 7 7 7', chevD: 'M6 9l6 6 6-6',
  x: 'M6 6l12 12M18 6 6 18',
  editdoc: 'M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M13 3l5 5v1.5M18.2 12.8l2 2-6.6 6.6-3 .9.9-3z',
  sigma: 'M18 5H7l6 7-6 7h11',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  wave: 'M2 12h3l3-8 4 16 3-8h7',
  book: 'M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 1h13',
  headset: ['M4 14v-2a8 8 0 0 1 16 0v2', 'r:3,13.5,4,6,1.5', 'r:17,13.5,4,6,1.5', 'M19 19.5c0 1-1.5 1.8-4.5 1.8H12'],
  radar: ['M4.5 17.5A9 9 0 0 1 12 3M7.5 16A5.5 5.5 0 0 1 12 7', 'c:12,12,1.6', 'M12 12l6.5-5.5'],
  chart: 'M5 20v-9M12 20V4M19 20v-6',
  alert: 'M12 3.2 2.4 19.6A1 1 0 0 0 3.3 21h17.4a1 1 0 0 0 .9-1.4zM12 10v4.5M12 17.6h.01',
  check: ['M8 12.3l2.8 2.8L16 9.5', 'c:12,12,9'],
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  play: ['M10 8.5v7l6-3.5z', 'r:3,5,18,14,3'],
  more: 'M12 5h.01M12 12h.01M12 19h.01',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
  backspace: ['M9.5 5H20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9.5L3 12z', 'M12.5 9.5l5 5M17.5 9.5l-5 5'],
  faceid: ['M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2', 'M9 9.5v1.8M15 9.5v1.8M12 9.5v3.2h-1M9 16c1.7 1.3 4.3 1.3 6 0'],
  msmenu: 'M5 8h14M5 12h14M5 16h9',
  share: 'M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
  arrowL: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  qr: ['r:3,3,7,7,1.5', 'r:14,3,7,7,1.5', 'r:3,14,7,7,1.5', 'M14 14h3v3M21 14v.01M14 21h3M21 18v3M17.5 17.5h.01'],
  plan: ['M9 6h11M9 12h11M9 18h11', 'M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11', 'c:5,18,1.4'],
  mail: ['r:3,5,18,14,2.5', 'M3.5 7l8.5 6 8.5-6'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'c:12,12,3'],
  eyeOff: ['M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.1M6.6 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  info: ['c:12,12,9', 'M12 16v-4.5M12 8h.01'],
  clock: ['c:12,12,9', 'M12 7v5l3.2 2'],
  door: ['M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21M3 21h18', 'M15 12h.01'],
}

/**
 * @param {{ name: string, size?: number, sw?: number, className?: string, style?: import('react').CSSProperties }} props
 */
export default function Icon({ name, size = 24, sw = 1.8, className, style }) {
  const spec = P[name]
  if (!spec) return null
  const parts = Array.isArray(spec) ? spec : [spec]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {parts.map((p, i) => {
        if (p.startsWith('c:')) { const [cx, cy, r] = p.slice(2).split(',').map(Number); return <circle key={i} cx={cx} cy={cy} r={r} /> }
        if (p.startsWith('r:')) { const [x, y, w, h, rx] = p.slice(2).split(',').map(Number); return <rect key={i} x={x} y={y} width={w} height={h} rx={rx} /> }
        return <path key={i} d={p} />
      })}
    </svg>
  )
}

export function MsLogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
export function MsLogoMono({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 2h9.5v9.5H2zM12.5 2H22v9.5h-9.5zM2 12.5h9.5V22H2zM12.5 12.5H22V22h-9.5z" /></svg>
}
export function GoogleG({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="butt" aria-hidden="true">
      <path d="M20.6 10.8H12v3.6h4.9" /><path d="M20 7.2A9 9 0 1 0 20.8 14" />
    </svg>
  )
}
export function AppleLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.600-2.800-1.800-3.400-1.800-1.400-.1-2.800.9-3.500.9-.7 0-1.800-.8-3-.8-1.500 0-2.900.9-3.700 2.300-1.600 2.800-.4 6.900 1.100 9.100.8 1.100 1.700 2.300 2.900 2.300 1.100 0 1.600-.7 3-.7s1.800.7 3 .7c1.200 0 2-1.100 2.800-2.200.9-1.300 1.200-2.500 1.200-2.600-.1 0-2.400-.9-2.400-3.700zM14.200 6c.6-.8 1.100-1.800.9-2.900-.9 0-2 .6-2.700 1.400-.6.700-1.100 1.800-1 2.800 1 .1 2.100-.5 2.800-1.300z" />
    </svg>
  )
}

export function StatusIcons() {
  return (
    <span className="sb-icons" aria-hidden="true">
      <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
      <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><path d="M8.5 2.2c2.300 0 4.400.9 6 2.400l1.100-1.200A10.500 10.500 0 0 0 8.500.5 10.500 10.500 0 0 0 1.400 3.400l1.100 1.200a8.800 8.800 0 0 1 6-2.400zm0 3.600c1.400 0 2.700.5 3.700 1.400l1.100-1.200a7.400 7.400 0 0 0-9.600 0l1.100 1.200c1-.9 2.300-1.400 3.700-1.400zm0 3.500c.6 0 1.200.2 1.600.6L8.500 11.500 6.900 9.900c.4-.4 1-.6 1.600-.6z" /></svg>
      <svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x="0.5" y="0.5" width="23" height="12" rx="3.500" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor" /><path d="M25 4.500v4c.8-.3 1.500-1.100 1.500-2s-.7-1.700-1.500-2z" fill="currentColor" opacity=".45" /></svg>
    </span>
  )
}
