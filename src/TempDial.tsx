import { useRef, useState } from "react";

interface TempDialProps {
  /** Current target temperature from the device. */
  value: number;
  min: number;
  max: number;
  /** Room temperature reported by the device, if any. */
  roomTemp?: number | null;
  unit: string;
  /** Device mode index (0 Auto, 1 Cool, 4 Heat): tints the arc. */
  mode: number;
  disabled?: boolean;
  /** Fired once when a drag or key adjustment ends. */
  onCommit: (value: number) => void;
}

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 84;
const START_DEG = 135;
const SWEEP_DEG = 270;

function angleToTemp(angleDeg: number, min: number, max: number): number {
  const rel = (((angleDeg - START_DEG) % 360) + 360) % 360;
  const clamped = rel > SWEEP_DEG ? (rel < SWEEP_DEG + 45 ? SWEEP_DEG : 0) : rel;
  return Math.round(min + (clamped / SWEEP_DEG) * (max - min));
}

function tempToAngle(temp: number, min: number, max: number): number {
  const fraction = (temp - min) / Math.max(1, max - min);
  return START_DEG + fraction * SWEEP_DEG;
}

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function arcColor(mode: number): string {
  if (mode === 1) return "#228be6";
  if (mode === 4) return "#fd7e14";
  return "#12b886";
}

/**
 * Circular temperature control: drag around the ring (or use arrow keys)
 * to pick a value. The device is updated only when the gesture ends.
 */
export default function TempDial({
  value,
  min,
  max,
  roomTemp,
  unit,
  mode,
  disabled,
  onCommit,
}: TempDialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const shown = dragValue ?? value;

  const pickFromPointer = (clientX: number, clientY: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return angleToTemp(angle < 0 ? angle + 360 : angle, min, max);
  };

  const commit = (next: number | null) => {
    setDragValue(null);
    if (next != null && next !== value) {
      onCommit(next);
    }
  };

  const circumference = 2 * Math.PI * RADIUS;
  const arcFraction = SWEEP_DEG / 360;
  const shownFraction = (shown - min) / Math.max(1, max - min);
  const color = arcColor(mode);

  const ticks: number[] = [];
  for (let t = min; t <= max; t += 1) ticks.push(t);

  return (
    <div className="dial-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={disabled ? "temp-dial disabled" : "temp-dial"}
        role="slider"
        aria-label="Target temperature"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={shown}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragValue(pickFromPointer(e.clientX, e.clientY));
        }}
        onPointerMove={(e) => {
          if (disabled || dragValue == null) return;
          const next = pickFromPointer(e.clientX, e.clientY);
          if (next != null) setDragValue(next);
        }}
        onPointerUp={(e) => {
          if (disabled || dragValue == null) return;
          const next = pickFromPointer(e.clientX, e.clientY);
          commit(next ?? dragValue);
        }}
        onPointerCancel={() => setDragValue(null)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            onCommit(Math.min(max, value + 1));
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            onCommit(Math.max(min, value - 1));
          }
        }}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          className="dial-track"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${arcFraction * circumference} ${circumference}`}
          transform={`rotate(${START_DEG} ${CENTER} ${CENTER})`}
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${shownFraction * arcFraction * circumference} ${circumference}`}
          transform={`rotate(${START_DEG} ${CENTER} ${CENTER})`}
        />
        {ticks.map((t) => {
          const a = tempToAngle(t, min, max);
          const outer = polar(a, RADIUS - 12);
          const inner = polar(a, RADIUS - 18);
          return (
            <line
              key={t}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              className={t === shown ? "dial-tick active" : "dial-tick"}
              strokeWidth={t === shown ? 3 : 2}
            />
          );
        })}
        <text x={CENTER} y={CENTER - 2} textAnchor="middle" className="dial-number">
          {shown}
          {unit}
        </text>
        {roomTemp != null && (
          <text x={CENTER} y={CENTER + 24} textAnchor="middle" className="dial-room">
            Room {roomTemp}
            {unit}
          </text>
        )}
      </svg>
    </div>
  );
}
