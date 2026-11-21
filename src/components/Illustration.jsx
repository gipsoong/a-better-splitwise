// Small inline illustrations for empty states. Colours come from CSS variables so they work in dark mode.
export function Illustration({ kind, size = 150 }) {
  return (
    <svg className="illus" viewBox="0 0 160 130" width={size} height={size * 0.8125} aria-hidden="true">
      <ellipse cx="80" cy="118" rx="54" ry="7" fill="var(--ill-shadow)" />
      {ART[kind] || ART.receipts}
    </svg>
  )
}

const coin = (x, y, r = 11) => (
  <g key={`${x}-${y}`} className="float" style={{ animationDelay: `${(x % 7) * 120}ms` }}>
    <circle cx={x} cy={y} r={r} fill="var(--ill-gold)" />
    <circle cx={x} cy={y} r={r - 3.5} fill="none" stroke="var(--ill-gold-2)" strokeWidth="2" />
    <text x={x} y={y + 4} textAnchor="middle" fontSize={r} fontWeight="800" fill="var(--ill-gold-2)">$</text>
  </g>
)

const ART = {
  receipts: (
    <g>
      <g transform="rotate(-8 62 64)">
        <path d="M40 22h44v84l-5.5-4-5.5 4-5.5-4-5.5 4-5.5-4-5.5 4-5.5-4-5.5 4z" fill="var(--ill-paper-2)" />
      </g>
      <path d="M62 16h50v92l-6.25-4.5-6.25 4.5-6.25-4.5-6.25 4.5-6.25-4.5-6.25 4.5-6.25-4.5-6.25 4.5z" fill="var(--ill-paper)" stroke="var(--ill-line)" strokeWidth="1.5" />
      <rect x="71" y="30" width="22" height="5" rx="2.5" fill="var(--accent)" />
      {[44, 54, 64, 74].map((y, i) => <rect key={y} x="71" y={y} width={[32, 26, 30, 20][i]} height="4" rx="2" fill="var(--ill-line)" />)}
      <rect x="71" y="88" width="32" height="6" rx="3" fill="var(--ill-accent-soft)" />
      {coin(124, 40)}
      {coin(36, 96, 9)}
      <path d="M130 84l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="var(--accent)" className="twinkle" />
    </g>
  ),
  groups: (
    <g>
      <circle cx="56" cy="62" r="22" fill="#7c3aed" opacity=".9" className="float" />
      <circle cx="104" cy="62" r="22" fill="#db2777" opacity=".9" className="float" style={{ animationDelay: '200ms' }} />
      <circle cx="80" cy="50" r="26" fill="var(--accent)" className="float" style={{ animationDelay: '400ms' }} />
      <text x="80" y="60" textAnchor="middle" fontSize="26">🧾</text>
      <text x="52" y="70" textAnchor="middle" fontSize="18">🍜</text>
      <text x="108" y="70" textAnchor="middle" fontSize="18">🚕</text>
      {coin(128, 100, 9)}
      <path d="M30 30l2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5 5-2.5z" fill="var(--ill-gold)" className="twinkle" />
    </g>
  ),
  party: (
    <g>
      <path d="M50 108l22-62 40 40z" fill="var(--accent)" />
      <path d="M58 86l9-25M68 98l14-38" stroke="var(--ill-paper)" strokeWidth="5" strokeLinecap="round" opacity=".5" />
      {[[100, 30, '#db2777'], [120, 52, 'var(--ill-gold)'], [88, 18, '#7c3aed'], [128, 26, 'var(--accent-2)'], [110, 70, '#ea580c']].map(([x, y, c], i) => (
        <rect key={i} x={x} y={y} width="8" height="8" rx="2" fill={c} transform={`rotate(${i * 33} ${x} ${y})`} className="float" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </g>
  ),
  clock: (
    <g>
      <circle cx="80" cy="62" r="40" fill="var(--ill-paper)" stroke="var(--ill-line)" strokeWidth="2" />
      <circle cx="80" cy="62" r="32" fill="var(--ill-accent-soft)" />
      <path d="M80 40v22l14 9" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M36 40a50 50 0 0 1 12-14" stroke="var(--accent-2)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M30 38l6 2 2-6" stroke="var(--accent-2)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  ),
  wave: (
    <g>
      <circle cx="80" cy="60" r="38" fill="var(--ill-accent-soft)" />
      <text x="80" y="76" textAnchor="middle" fontSize="44" className="wave-hand">👋</text>
      <path d="M128 30l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="var(--ill-gold)" className="twinkle" />
    </g>
  ),
  lost: (
    <g>
      <circle cx="80" cy="60" r="38" fill="var(--ill-accent-soft)" />
      <text x="80" y="76" textAnchor="middle" fontSize="44">🧭</text>
    </g>
  ),
}
