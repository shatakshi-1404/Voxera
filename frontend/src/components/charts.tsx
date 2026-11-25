/** Shared Recharts styling so every chart uses the same palette, axes and tooltip. */
export const CHART = { accent: '#FF7A45', accent2: '#FFC857', mint: '#5EEAD4', warn: '#F5A524', grid: 'rgb(255 255 255 / 0.07)', tick: '#8A8176' }
export function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p: any) => <p key={p.dataKey} className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.stroke }} />{p.name}: <b className="text-ink">{p.value}</b></p>)}
    </div>
  )
}
