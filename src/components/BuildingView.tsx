import React from 'react';
import type { Slab, Beam, Column, FrameResult, FlexureResult, ShearResult, BeamOnBeamConnection } from '@/lib/structuralEngine';
import { getEndpointColumnHalfWidth } from '@/lib/beamMomentPostprocess';

interface BuildingViewProps {
  slabs: Slab[];
  beams: Beam[];
  columns: Column[];
  analyzed: boolean;
  frameResults: FrameResult[];
  beamDesigns: {
    beamId: string; frameId: string; Vu: number;
    flexLeft: FlexureResult; flexMid: FlexureResult; flexRight: FlexureResult;
    shear: ShearResult;
    deflection?: any;
  }[];
  colDesigns: { id: string; b: number; h: number; Pu: number; design: any }[];
  onSelectElement?: (type: 'beam' | 'column' | 'slab', id: string) => void;
  storyHeight?: number;
  removedColumnIds?: string[];
  bobConnections?: BeamOnBeamConnection[];
  /** Show beam moment diagrams (ETABS style) */
  showMoments?: boolean;
  /** Show slab rectangles (default: false — hidden to keep the view uncluttered) */
  showSlabs?: boolean;
  viewMode?: 'moments' | 'deflection' | 'none';
}

function getStressColor(ratio: number): string {
  if (ratio < 0.5) return 'hsl(var(--stress-safe))';
  if (ratio < 0.8) return 'hsl(var(--stress-warn))';
  return 'hsl(var(--stress-danger))';
}

export default function BuildingView({
  slabs, beams, columns, analyzed, frameResults, beamDesigns, onSelectElement,
  removedColumnIds = [], bobConnections = [], showMoments = false, showSlabs = false,
  viewMode = 'none',
}: BuildingViewProps) {
  const allX = slabs.flatMap(s => [s.x1, s.x2]);
  const allY = slabs.flatMap(s => [s.y1, s.y2]);
  const minX = Math.min(...allX) - 1;
  const maxX = Math.max(...allX) + 1;
  const minY = Math.min(...allY) - 1;
  const maxY = Math.max(...allY) + 1;

  const scale = 50;
  const padding = 40;
  const width = (maxX - minX) * scale + padding * 2;
  const height = (maxY - minY) * scale + padding * 2;

  const tx = (x: number) => (x - minX) * scale + padding;
  // Flip Y so origin (0,0) sits at bottom-left like math axes, not top-left like SVG default
  const ty = (y: number) => height - ((y - minY) * scale + padding);

  const beamStressMap = new Map<string, number>();
  if (analyzed) {
    for (const d of beamDesigns) {
      const maxCheck = [d.flexLeft.checkSpacing, d.flexMid.checkSpacing, d.flexRight.checkSpacing];
      const hasTwoLayers = maxCheck.some(c => c !== 'ok');
      beamStressMap.set(d.beamId, hasTwoLayers ? 0.9 : 0.4);
    }
  }

  // Build moment data map for ETABS-style display
  const beamMomentMap = new Map<string, { Mleft: number; Mmid: number; Mright: number; direction: 'horizontal' | 'vertical'; momentStations?: number[] }>();
  if (analyzed && showMoments && frameResults) {
    for (const fr of frameResults) {
      for (const br of fr.beams) {
        const beam = beams.find(b => b.id === br.beamId);
        if (beam) {
          beamMomentMap.set(br.beamId, {
            Mleft: br.Mleft,
            Mmid: br.Mmid,
            Mright: br.Mright,
            direction: beam.direction,
            momentStations: br.momentStations,
          });
        }
      }
    }
  }

  // Scale factor for moment diagram offset
  const allMoments = [...beamMomentMap.values()].flatMap(m => [
    Math.abs(m.Mleft),
    Math.abs(m.Mmid),
    Math.abs(m.Mright),
    ...(m.momentStations ? m.momentStations.map(Math.abs) : [])
  ]);
  const maxMoment = Math.max(...allMoments, 1);
  const momentScale = 45; // max pixel offset for moment diagram (increased from 25)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-[60vh] md:max-h-[70vh]" style={{ background: 'hsl(var(--background))' }}>
      {/* Grid lines */}
      {[...new Set(slabs.flatMap(s => [s.x1, s.x2]))].sort((a, b) => a - b).map(x => (
        <line key={`gx${x}`} x1={tx(x)} y1={padding / 2} x2={tx(x)} y2={height - padding / 2}
          stroke="hsl(var(--canvas-grid))" strokeWidth="0.5" strokeDasharray="4" />
      ))}
      {[...new Set(slabs.flatMap(s => [s.y1, s.y2]))].sort((a, b) => a - b).map(y => (
        <line key={`gy${y}`} x1={padding / 2} y1={ty(y)} x2={width - padding / 2} y2={ty(y)}
          stroke="hsl(var(--canvas-grid))" strokeWidth="0.5" strokeDasharray="4" />
      ))}

      {/* Slabs — only rendered when showSlabs is true */}
      {showSlabs && slabs.map(s => (
        <g key={s.id} className="cursor-pointer" onClick={() => onSelectElement?.('slab', s.id)}>
          <rect x={tx(s.x1)} y={ty(s.y1)} width={(s.x2 - s.x1) * scale} height={(s.y2 - s.y1) * scale}
            fill="hsl(var(--slab-fill) / 0.08)" stroke="hsl(var(--slab))" strokeWidth="0.5" />
          <text x={tx((s.x1 + s.x2) / 2)} y={ty((s.y1 + s.y2) / 2)} textAnchor="middle" dominantBaseline="middle"
            className="fill-muted-foreground" fontSize="10" fontFamily="JetBrains Mono">{s.id}</text>
        </g>
      ))}

      {/* Beams */}
      {beams.map(b => {
        let color = 'hsl(var(--beam))';
        let labelExtra = '';
        
        if (analyzed) {
          if (viewMode === 'deflection') {
            const d = beamDesigns.find(bd => bd.beamId === b.id || ((bd as any).mergedCarrierIds && (bd as any).mergedCarrierIds.includes(b.id)));
            if (d && d.deflection) {
              const delta = d.deflection.deflection;
              const allowable = d.deflection.allowableDeflection;
              const isAdequate = d.deflection.isServiceable;
              color = isAdequate ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
              labelExtra = `(δ=${delta.toFixed(1)}/max=${allowable.toFixed(1)} مم)`;
            } else {
              color = 'hsl(var(--muted-foreground))';
            }
          } else {
            const stress = beamStressMap.get(b.id) || 0;
            color = getStressColor(stress);
          }
        }

        const xMid = tx((b.x1 + b.x2) / 2);
        const yMid = ty((b.y1 + b.y2) / 2);

        return (
          <g key={b.id} className="cursor-pointer" onClick={() => onSelectElement?.('beam', b.id)}>
            <line x1={tx(b.x1)} y1={ty(b.y1)} x2={tx(b.x2)} y2={ty(b.y2)} stroke={color} strokeWidth="3" />
            <text x={xMid} y={yMid - 6} textAnchor="middle"
              className="fill-foreground font-semibold" fontSize="8" fontFamily="JetBrains Mono">
              {b.name ?? b.id}
            </text>
            {labelExtra && (
              <text x={xMid} y={yMid + 12} textAnchor="middle"
                className={color === 'rgb(239, 68, 68)' ? 'fill-destructive font-bold' : 'fill-green-600 font-semibold'}
                fontSize="7" fontFamily="JetBrains Mono">
                {labelExtra}
              </text>
            )}
          </g>
        );
      })}

      {/* Beam Moment Diagrams — ETABS style */}
      {showMoments && beamMomentMap.size > 0 && beams.map(b => {
        const mData = beamMomentMap.get(b.id);
        if (!mData) return null;

        const bx1 = tx(b.x1);
        const by1 = ty(b.y1);
        const bx2 = tx(b.x2);
        const by2 = ty(b.y2);

        const halfColLeft = getEndpointColumnHalfWidth(columns, b.x1, b.y1, b.direction === 'horizontal');
        const halfColRight = getEndpointColumnHalfWidth(columns, b.x2, b.y2, b.direction === 'horizontal');
        const L_val = b.length;

        const rawStations = mData.momentStations && mData.momentStations.length >= 2 
          ? mData.momentStations 
          : (() => {
              const ml = mData.Mleft;
              const mm = mData.Mmid;
              const mr = mData.Mright;
              const res: number[] = [];
              for (let i = 0; i <= 20; i++) {
                const t = i / 20;
                res.push(ml * (1 - t) * (1 - 2 * t) + 4 * mm * t * (1 - t) + mr * t * (2 * t - 1));
              }
              return res;
            })();

        const negPoints: { x: number, y: number }[] = [];
        const posPoints: { x: number, y: number }[] = [];

        for (let i = 0; i < rawStations.length; i++) {
          const t = i / (rawStations.length - 1);
          const pos_m = t * L_val;
          
          let valNeg = Math.min(0, rawStations[i]);
          if (pos_m < halfColLeft || pos_m > L_val - halfColRight) {
            valNeg = 0; // Negative (hogging) moment stops at column face
          }
          
          const valPos = Math.max(0, rawStations[i]);
          
          const px = bx1 + t * (bx2 - bx1);
          const py = by1 + t * (by2 - by1);
          
          const offsetNeg = (valNeg / maxMoment) * momentScale;
          const offsetPos = (valPos / maxMoment) * momentScale;
          
          if (b.direction === 'horizontal') {
            negPoints.push({ x: px, y: py + offsetNeg });
            posPoints.push({ x: px, y: py + offsetPos });
          } else {
            negPoints.push({ x: px - offsetNeg, y: py });
            posPoints.push({ x: px - offsetPos, y: py });
          }
        }

        const negPathStr = `M ${bx1.toFixed(1)} ${by1.toFixed(1)} ` + negPoints.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + ` L ${bx2.toFixed(1)} ${by2.toFixed(1)} Z`;
        const posPathStr = `M ${bx1.toFixed(1)} ${by1.toFixed(1)} ` + posPoints.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + ` L ${bx2.toFixed(1)} ${by2.toFixed(1)} Z`;

        // Key label values at left face, mid-span peak, and right face
        const tLeft = L_val > 0 ? halfColLeft / L_val : 0;
        const xLeft = bx1 + tLeft * (bx2 - bx1);
        const yLeft = by1 + tLeft * (by2 - by1);
        const mLeftVal = rawStations[0];

        const tRight = L_val > 0 ? (L_val - halfColRight) / L_val : 1;
        const xRight = bx1 + tRight * (bx2 - bx1);
        const yRight = by1 + tRight * (by2 - by1);
        const mRightVal = rawStations[rawStations.length - 1];

        let maxPosIndex = Math.floor(rawStations.length / 2);
        let maxPosVal = 0;
        for (let i = 0; i < rawStations.length; i++) {
          if (rawStations[i] > maxPosVal) {
            maxPosVal = rawStations[i];
            maxPosIndex = i;
          }
        }
        if (maxPosVal === 0) {
          let minVal = 0;
          for (let i = 0; i < rawStations.length; i++) {
            if (rawStations[i] < minVal) {
              minVal = rawStations[i];
              maxPosIndex = i;
            }
          }
        }
        const tMid = maxPosIndex / (rawStations.length - 1);
        const xMid = bx1 + tMid * (bx2 - bx1);
        const yMid = by1 + tMid * (by2 - by1);
        const mMidVal = rawStations[maxPosIndex];

        const f = (val: number) => Math.abs(val) > 0.1 ? Math.abs(val).toFixed(1) : '';

        const sLeft = (mLeftVal / maxMoment) * momentScale;
        const sRight = (mRightVal / maxMoment) * momentScale;
        const sMid = (mMidVal / maxMoment) * momentScale;

        if (b.direction === 'horizontal') {
          return (
            <g key={`bmd-${b.id}`}>
              {/* Negative moments path (Red) */}
              {Math.abs(Math.min(...rawStations)) > 0.05 && (
                <path d={negPathStr} fill="rgba(239, 68, 68, 0.18)" stroke="rgb(239, 68, 68)" strokeWidth="0.8" />
              )}
              {/* Positive moments path (Yellow) */}
              {Math.max(...rawStations) > 0.05 && (
                <path d={posPathStr} fill="rgba(234, 179, 8, 0.18)" stroke="rgb(234, 179, 8)" strokeWidth="0.8" />
              )}

              {/* Labels */}
              {f(mLeftVal) && (
                <text x={xLeft + 2} y={yLeft + sLeft + (sLeft <= 0 ? -4 : 9)} fontSize="6" fill={mLeftVal < 0 ? 'rgb(239, 68, 68)' : 'rgb(234, 179, 8)'} fontWeight="bold" fontFamily="monospace">
                  {f(mLeftVal)}
                </text>
              )}
              {f(mMidVal) && (
                <text x={xMid} y={yMid + sMid + (sMid <= 0 ? -4 : 9)} textAnchor="middle" fontSize="6" fill={mMidVal < 0 ? 'rgb(239, 68, 68)' : 'rgb(234, 179, 8)'} fontWeight="bold" fontFamily="monospace">
                  {f(mMidVal)}
                </text>
              )}
              {f(mRightVal) && (
                <text x={xRight - 2} y={yRight + sRight + (sRight <= 0 ? -4 : 9)} textAnchor="end" fontSize="6" fill={mRightVal < 0 ? 'rgb(239, 68, 68)' : 'rgb(234, 179, 8)'} fontWeight="bold" fontFamily="monospace">
                  {f(mRightVal)}
                </text>
              )}
            </g>
          );
        } else {
          return (
            <g key={`bmd-${b.id}`}>
              {/* Negative moments path (Red) */}
              {Math.abs(Math.min(...rawStations)) > 0.05 && (
                <path d={negPathStr} fill="rgba(239, 68, 68, 0.18)" stroke="rgb(239, 68, 68)" strokeWidth="0.8" />
              )}
              {/* Positive moments path (Yellow) */}
              {Math.max(...rawStations) > 0.05 && (
                <path d={posPathStr} fill="rgba(234, 179, 8, 0.18)" stroke="rgb(234, 179, 8)" strokeWidth="0.8" />
              )}

              {/* Labels */}
              {f(mLeftVal) && (
                <text x={xLeft - sLeft + (sLeft <= 0 ? 3 : -3)} y={yLeft + 3} textAnchor={sLeft <= 0 ? 'start' : 'end'} fontSize="6" fill={mLeftVal < 0 ? 'rgb(239, 68, 68)' : 'rgb(234, 179, 8)'} fontWeight="bold" fontFamily="monospace">
                  {f(mLeftVal)}
                </text>
              )}
              {f(mMidVal) && (
                <text x={xMid - sMid + (sMid <= 0 ? 3 : -3)} y={yMid + 3} textAnchor={sMid <= 0 ? 'start' : 'end'} fontSize="6" fill={mMidVal < 0 ? 'rgb(239, 68, 68)' : 'rgb(234, 179, 8)'} fontWeight="bold" fontFamily="monospace">
                  {f(mMidVal)}
                </text>
              )}
              {f(mRightVal) && (
                <text x={xRight - sRight + (sRight <= 0 ? 3 : -3)} y={yRight + 3} textAnchor={sRight <= 0 ? 'start' : 'end'} fontSize="6" fill={mRightVal < 0 ? 'rgb(239, 68, 68)' : 'rgb(234, 179, 8)'} fontWeight="bold" fontFamily="monospace">
                  {f(mRightVal)}
                </text>
              )}
            </g>
          );
        }
      })}

      {/* Columns */}
      {columns.map(c => {
        const isRemoved = removedColumnIds.includes(c.id);
        if (isRemoved) {
          return (
            <g key={c.id} className="cursor-pointer" onClick={() => onSelectElement?.('beam', c.id)}>
              <circle cx={tx(c.x)} cy={ty(c.y)} r="6" fill="none" stroke="hsl(var(--destructive))" strokeWidth="1.5" />
              <text x={tx(c.x)} y={ty(c.y) + 3} textAnchor="middle" fontSize="8" fill="hsl(var(--destructive))">×</text>
              <text x={tx(c.x)} y={ty(c.y) + 16} textAnchor="middle" className="fill-foreground" fontSize="7" fontFamily="JetBrains Mono">{c.id}</text>
            </g>
          );
        }

        const wWidth = (c.b / 1000) * scale;
        const wHeight = (c.h / 1000) * scale;
        const cx = tx(c.x);
        const cy = ty(c.y);
        const angle = c.orientAngle ?? 0;

        return (
          <g key={c.id} className="cursor-pointer" onClick={() => onSelectElement?.('column', c.id)} transform={`translate(${cx}, ${cy}) rotate(${-angle})`}>
            <rect x={-wWidth / 2} y={-wHeight / 2} width={wWidth} height={wHeight} fill="hsl(var(--column))" rx="1" stroke="hsl(var(--foreground))" strokeWidth="1" />
            <text x="0" y={wHeight / 2 + 10} textAnchor="middle" transform={`rotate(${angle})`} className="fill-foreground font-bold" fontSize="7" fontFamily="JetBrains Mono">{c.id}</text>
          </g>
        );
      })}

      {/* Beam-on-Beam load path arrows */}
      {bobConnections.map((conn, i) => {
        const px = tx(conn.point.x);
        const py = ty(conn.point.y);
        return (
          <text key={`bob${i}`} x={px} y={py - 10} textAnchor="middle" fontSize="14" fill="hsl(var(--accent))">⇊</text>
        );
      })}

      {/* Axis labels */}
      {[...new Set(slabs.flatMap(s => [s.x1, s.x2]))].sort((a, b) => a - b).map(x => (
        <text key={`lx${x}`} x={tx(x)} y={height - 5} textAnchor="middle" fontSize="9"
          className="fill-muted-foreground" fontFamily="JetBrains Mono">{x}m</text>
      ))}
      {[...new Set(slabs.flatMap(s => [s.y1, s.y2]))].sort((a, b) => a - b).map(y => (
        <text key={`ly${y}`} x={10} y={ty(y) + 3} fontSize="9"
          className="fill-muted-foreground" fontFamily="JetBrains Mono">{y}m</text>
      ))}

      {/* Legend */}
      {analyzed && (
        viewMode === 'deflection' ? (
          <g transform={`translate(${width - 180}, ${height - 30})`}>
            <rect x="0" y="0" width="8" height="8" fill="rgb(34, 197, 94)" />
            <text x="12" y="7" fontSize="7" className="fill-foreground">مستوفٍ للترخيم (آمن)</text>
            <rect x="95" y="0" width="8" height="8" fill="rgb(239, 68, 68)" />
            <text x="107" y="7" fontSize="7" className="fill-foreground">تجاوز المسموح (خطر)</text>
          </g>
        ) : (
          <g transform={`translate(${width - 120}, ${height - 30})`}>
            <rect x="0" y="0" width="8" height="8" fill="hsl(var(--stress-safe))" />
            <text x="12" y="7" fontSize="7" className="fill-foreground">آمن</text>
            <rect x="35" y="0" width="8" height="8" fill="hsl(var(--stress-warn))" />
            <text x="47" y="7" fontSize="7" className="fill-foreground">تحذير</text>
            <rect x="70" y="0" width="8" height="8" fill="hsl(var(--stress-danger))" />
            <text x="82" y="7" fontSize="7" className="fill-foreground">خطر</text>
          </g>
        )
      )}

      {/* Moment legend */}
      {showMoments && beamMomentMap.size > 0 && (
        <g transform={`translate(${padding}, ${height - 30})`}>
          <rect x="0" y="0" width="8" height="8" fill="hsl(0 70% 50% / 0.3)" stroke="hsl(0 70% 50%)" strokeWidth="0.5" />
          <text x="11" y="7" fontSize="6" className="fill-foreground">M⁻ سالب</text>
          <rect x="55" y="0" width="8" height="8" fill="hsl(210 70% 50% / 0.3)" stroke="hsl(210 70% 50%)" strokeWidth="0.5" />
          <text x="66" y="7" fontSize="6" className="fill-foreground">M⁺ موجب</text>
          <text x="110" y="7" fontSize="5" className="fill-muted-foreground">(kN.m)</text>
        </g>
      )}
    </svg>
  );
}
