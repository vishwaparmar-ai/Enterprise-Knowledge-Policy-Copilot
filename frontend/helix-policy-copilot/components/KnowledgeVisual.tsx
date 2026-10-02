/** Abstract helix of two strands threading through connected policy documents. */
function Doc({ x, y, accent = false }: { x: number; y: number; accent?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="130" height="70" rx="10" fill="#0F172A" stroke={accent ? "#3B82F6" : "#fff"} strokeOpacity={accent ? 0.9 : 0.16} />
      <rect x="14" y="14" width="44" height="5" rx="2.5" fill={accent ? "#60A5FA" : "#fff"} fillOpacity={accent ? 1 : 0.35} />
      <rect x="14" y="30" width="100" height="4" rx="2" fill="#fff" fillOpacity=".14" />
      <rect x="14" y="42" width="82" height="4" rx="2" fill="#fff" fillOpacity=".14" />
      <rect x="14" y="54" width="60" height="4" rx="2" fill="#fff" fillOpacity=".14" />
    </g>
  );
}

export default function KnowledgeVisual() {
  const nodes: [number, number][] = [[225, 170], [375, 170], [60, 437], [540, 437]];
  return (
    <svg viewBox="0 0 600 560" className="h-full max-h-[460px] w-full" fill="none" role="img" aria-label="Policy documents connected by a helix-shaped knowledge network">
      <g stroke="#fff" strokeOpacity=".12" strokeWidth="1">
        <path d="M95 125 225 170M505 160 375 170M365 265 375 170M300 265 225 170M125 490 60 437M475 490 540 437" />
      </g>
      <path d="M150 20C450 110 450 230 150 320S150 470 330 540" stroke="#3B82F6" strokeOpacity=".7" strokeWidth="1.5" />
      <path d="M450 20C150 110 150 230 450 320S450 470 270 540" stroke="#fff" strokeOpacity=".28" strokeWidth="1.5" />
      <Doc x={30} y={60} />
      <Doc x={440} y={90} />
      <Doc x={235} y={230} accent />
      <Doc x={60} y={455} />
      <Doc x={410} y={455} />
      {nodes.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.5" fill="#0F172A" stroke="#60A5FA" strokeWidth="1.5" />
      ))}
    </svg>
  );
}
