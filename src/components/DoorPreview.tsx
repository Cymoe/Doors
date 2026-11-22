import { useId, type ReactNode } from "react";
import { formatInches } from "@/pricing";

/**
 * A simple elevation drawing of the door as configured: style, wood grade,
 * configuration (number of doors, barn track, pocket), and proportions from
 * the measured opening. Units are inches.
 */

interface Props {
  style: string; // style code
  grade: string; // grade code
  configuration: string; // configuration code
  leaves: number;
  widthIn?: number; // opening width
  heightIn?: number;
  showDimensions?: boolean;
  label?: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const WOOD = {
  CLR: { base: "#ecd0a4", panel: "#e3c190", edge: "#b98a52", grain: "#d9b47f" },
  KNT: { base: "#e2b77f", panel: "#d8a96d", edge: "#a87438", grain: "#c9955a" },
};

export function DoorPreview({ style, grade, configuration, leaves, widthIn, heightIn, showDimensions, label }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const wood = grade === "KNT" ? WOOD.KNT : WOOD.CLR;
  const defaultWidth = configuration === "BIF" ? 30 : leaves > 1 ? 60 : 32;
  const openingW = clamp(widthIn && widthIn > 0 ? widthIn : defaultWidth, 8, 120);
  const H = clamp(heightIn && heightIn > 0 ? heightIn : 80, 40, 120);
  const gap = leaves > 1 ? 0.5 : 0;
  const slabW = clamp((openingW - gap * (leaves - 1)) / leaves, 6, 60);
  const totalW = slabW * leaves + gap * (leaves - 1);

  const padX = configuration === "POCKET" ? slabW + 8 : 8;
  const padTop = configuration === "BARN" ? 10 : 4;
  const padBottom = showDimensions ? 12 : 4;
  const padLeft = showDimensions ? 12 : 4;
  const vbW = padLeft + totalW + padX;
  const vbH = padTop + H + padBottom;
  const x0 = padLeft;
  const y0 = padTop;

  const leavesSvg: ReactNode[] = [];
  for (let i = 0; i < leaves; i++) {
    const x = x0 + i * (slabW + gap);
    const knobSide: "left" | "right" | "none" =
      configuration === "BARN" || configuration === "POCKET" ? "none" : leaves === 1 ? "right" : i === 0 ? "right" : "left";
    leavesSvg.push(
      <Leaf key={i} x={x} y={y0} w={slabW} h={H} style={style} wood={wood} knob={knobSide} uid={uid}
        knotty={grade === "KNT"} seed={i} />,
    );
  }

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} role="img" aria-label={label ?? "Door preview"} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`mirror${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eef3f6" />
          <stop offset="0.5" stopColor="#c9d6de" />
          <stop offset="1" stopColor="#e6edf1" />
        </linearGradient>
        <linearGradient id={`glass${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dbe9ef" />
          <stop offset="1" stopColor="#c3d7e0" />
        </linearGradient>
      </defs>

      {configuration === "BARN" && (
        <g>
          <rect x={x0 - 6} y={y0 - 7} width={totalW + 12} height={1.6} rx={0.8} fill="#3b3430" />
          {[x0 + 4, x0 + totalW - 4].map((cx) => (
            <g key={cx}>
              <line x1={cx} y1={y0 - 6} x2={cx} y2={y0 + 3} stroke="#3b3430" strokeWidth={1} />
              <circle cx={cx} cy={y0 - 6.2} r={2} fill="#3b3430" />
            </g>
          ))}
        </g>
      )}
      {configuration === "POCKET" && (
        <rect x={x0 + totalW + 1} y={y0} width={slabW} height={H} fill="none" stroke="#b9ab98"
          strokeDasharray="2 1.5" strokeWidth={0.4} />
      )}

      {leavesSvg}

      {configuration === "BARN" && (
        <rect x={x0 + 3} y={y0 + H * 0.45} width={1.2} height={12} rx={0.6} fill="#3b3430" />
      )}
      {configuration === "POCKET" && (
        <rect x={x0 + totalW - 3.2} y={y0 + H * 0.47} width={1.6} height={5} rx={0.5} fill="#7a6a58" />
      )}
      {configuration === "BIF" &&
        [0.15, 0.5, 0.85].map((f) => (
          <rect key={f} x={x0 + slabW - 0.3} y={y0 + H * f} width={gap + 0.6} height={3} fill="#8c7a66" />
        ))}

      {showDimensions && widthIn && heightIn ? (
        <g fontSize={3} fill="#6c6158" fontFamily="system-ui, sans-serif">
          <line x1={x0} y1={y0 + H + 5} x2={x0 + totalW} y2={y0 + H + 5} stroke="#9a8d80" strokeWidth={0.3} />
          <line x1={x0} y1={y0 + H + 3.5} x2={x0} y2={y0 + H + 6.5} stroke="#9a8d80" strokeWidth={0.3} />
          <line x1={x0 + totalW} y1={y0 + H + 3.5} x2={x0 + totalW} y2={y0 + H + 6.5} stroke="#9a8d80" strokeWidth={0.3} />
          <text x={x0 + totalW / 2} y={y0 + H + 10} textAnchor="middle">{formatInches(widthIn)}</text>
          <line x1={x0 - 5} y1={y0} x2={x0 - 5} y2={y0 + H} stroke="#9a8d80" strokeWidth={0.3} />
          <line x1={x0 - 6.5} y1={y0} x2={x0 - 3.5} y2={y0} stroke="#9a8d80" strokeWidth={0.3} />
          <line x1={x0 - 6.5} y1={y0 + H} x2={x0 - 3.5} y2={y0 + H} stroke="#9a8d80" strokeWidth={0.3} />
          <text x={x0 - 7} y={y0 + H / 2} textAnchor="middle" transform={`rotate(-90 ${x0 - 7} ${y0 + H / 2})`}>
            {formatInches(heightIn)}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

interface LeafProps {
  x: number; y: number; w: number; h: number;
  style: string;
  wood: (typeof WOOD)["CLR"];
  knob: "left" | "right" | "none";
  uid: string;
  knotty: boolean;
  seed: number;
}

function Leaf({ x, y, w, h, style, wood, knob, uid, knotty, seed }: LeafProps) {
  const stile = clamp(w * 0.15, 2.5, 5);
  const rail = clamp(h * 0.06, 3, 6);
  const lock = clamp(h * 0.09, 5, 8); // middle (lock) rail
  const ix = x + stile;
  const iw = w - 2 * stile;
  const top = y + rail;
  const bottomRail = rail * 1.6;
  const innerH = h - rail - bottomRail;
  const lockY = y + h * 0.5 - lock / 2;

  const raised = (px: number, py: number, pw: number, ph: number, key: string | number) => (
    <g key={key}>
      <rect x={px} y={py} width={pw} height={ph} fill={wood.panel} stroke={wood.edge} strokeWidth={0.35} />
      <rect x={px + 1.6} y={py + 1.6} width={Math.max(pw - 3.2, 0.5)} height={Math.max(ph - 3.2, 0.5)}
        fill={wood.base} stroke={wood.edge} strokeWidth={0.2} />
    </g>
  );
  const flat = (px: number, py: number, pw: number, ph: number, key: string | number) => (
    <rect key={key} x={px} y={py} width={pw} height={ph} fill={wood.panel} stroke={wood.edge} strokeWidth={0.35} />
  );
  const louvers = (px: number, py: number, pw: number, ph: number, key: string | number) => {
    const n = Math.max(3, Math.floor(ph / 2.2));
    return (
      <g key={key}>
        <rect x={px} y={py} width={pw} height={ph} fill={wood.edge} opacity={0.35} stroke={wood.edge} strokeWidth={0.35} />
        {Array.from({ length: n }, (_, i) => (
          <rect key={i} x={px} y={py + (i * ph) / n + 0.2} width={pw} height={ph / n - 0.6} fill={wood.panel}
            stroke={wood.edge} strokeWidth={0.15} />
        ))}
      </g>
    );
  };

  let panels: ReactNode;
  switch (style) {
    case "2PAR": {
      const r = iw / 2;
      panels = (
        <>
          <path
            d={`M${ix} ${lockY} V${top + r * 0.6} Q${ix} ${top} ${ix + iw / 2} ${top} Q${ix + iw} ${top} ${ix + iw} ${top + r * 0.6} V${lockY} Z`}
            fill={wood.panel} stroke={wood.edge} strokeWidth={0.35}
          />
          <path
            d={`M${ix + 1.6} ${lockY - 1.6} V${top + r * 0.6 + 1} Q${ix + 1.6} ${top + 1.6} ${ix + iw / 2} ${top + 1.6} Q${ix + iw - 1.6} ${top + 1.6} ${ix + iw - 1.6} ${top + r * 0.6 + 1} V${lockY - 1.6} Z`}
            fill={wood.base} stroke={wood.edge} strokeWidth={0.2}
          />
          {raised(ix, lockY + lock, iw, y + h - bottomRail - lockY - lock, "b")}
        </>
      );
      break;
    }
    case "SHK": {
      const gapR = rail * 0.8;
      const ph = (innerH - 2 * gapR) / 3;
      panels = [0, 1, 2].map((i) => flat(ix, top + i * (ph + gapR), iw, ph, i));
      break;
    }
    case "4P": {
      const colW = (iw - stile * 0.8) / 2;
      const upper = lockY - top;
      const lower = y + h - bottomRail - lockY - lock;
      panels = (
        <>
          {raised(ix, top, colW, upper, "a")}
          {raised(ix + colW + stile * 0.8, top, colW, upper, "b")}
          {raised(ix, lockY + lock, colW, lower, "c")}
          {raised(ix + colW + stile * 0.8, lockY + lock, colW, lower, "d")}
        </>
      );
      break;
    }
    case "LOUV":
      panels = (
        <>
          {louvers(ix, top, iw, lockY - top, "a")}
          {louvers(ix, lockY + lock, iw, y + h - bottomRail - lockY - lock, "b")}
        </>
      );
      break;
    case "GLS": {
      const cols = iw > 14 ? 3 : 2;
      const rows = 5;
      const m = 0.8;
      const cw = (iw - m * (cols - 1)) / cols;
      const rh = (innerH - m * (rows - 1)) / rows;
      panels = (
        <>
          <rect x={ix} y={top} width={iw} height={innerH} fill={wood.panel} />
          {Array.from({ length: rows * cols }, (_, k) => {
            const c = k % cols;
            const r = Math.floor(k / cols);
            return (
              <rect key={k} x={ix + c * (cw + m)} y={top + r * (rh + m)} width={cw} height={rh}
                fill={`url(#glass${uid})`} stroke={wood.edge} strokeWidth={0.2} />
            );
          })}
        </>
      );
      break;
    }
    case "MIR":
      panels = (
        <>
          <rect x={ix} y={top} width={iw} height={innerH} fill={`url(#mirror${uid})`} stroke={wood.edge} strokeWidth={0.35} />
          <path d={`M${ix + iw * 0.2} ${top + innerH * 0.35} L${ix + iw * 0.55} ${top + innerH * 0.12}`}
            stroke="#fff" strokeWidth={1.2} opacity={0.7} />
          <path d={`M${ix + iw * 0.3} ${top + innerH * 0.45} L${ix + iw * 0.75} ${top + innerH * 0.16}`}
            stroke="#fff" strokeWidth={0.6} opacity={0.6} />
        </>
      );
      break;
    default: // 2PSQ: two raised panels, taller on top
      panels = (
        <>
          {raised(ix, top, iw, lockY - top, "a")}
          {raised(ix, lockY + lock, iw, y + h - bottomRail - lockY - lock, "b")}
        </>
      );
  }

  // Deterministic knots for knotty pine, on the stiles and rails.
  const knots = knotty
    ? [
        [x + stile * 0.5, y + h * (0.18 + 0.07 * seed)],
        [x + w - stile * 0.5, y + h * (0.66 - 0.05 * seed)],
        [x + w * 0.5, y + h - bottomRail * 0.5],
        [x + w * 0.35, y + rail * 0.5],
      ]
    : [];

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={wood.base} stroke={wood.edge} strokeWidth={0.5} />
      {[0.3, 0.7].map((f) => (
        <line key={f} x1={x + stile * f} y1={y + 1} x2={x + stile * f} y2={y + h - 1} stroke={wood.grain} strokeWidth={0.15} />
      ))}
      {panels}
      {knots.map(([kx, ky], i) => (
        <g key={i}>
          <ellipse cx={kx} cy={ky} rx={0.9} ry={0.6} fill="#8a5a2b" opacity={0.75} />
          <ellipse cx={kx} cy={ky} rx={1.5} ry={1} fill="none" stroke="#a87438" strokeWidth={0.15} />
        </g>
      ))}
      {knob !== "none" && (
        <circle cx={knob === "right" ? x + w - stile * 0.55 : x + stile * 0.55} cy={y + h * 0.5} r={1.1}
          fill="#5b4a3a" />
      )}
    </g>
  );
}
