interface Props {
  done: number;
  total: number;
  size?: number;
}

/**
 * The day's care as a ring that fills.
 *
 * It grows and shrinks with the plan rather than always showing a fixed number
 * of segments: a ring divided into four when the plan asks for two would make
 * a finished day look half done.
 */
export function CareRing({ done, total, size = 168 }: Props) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(done / total, 1) : 0;

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--paper-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 420ms var(--ease)" }}
        />
      </svg>
      <div className="ring__label">
        <strong>{done}</strong>
        <span>of {total}</span>
      </div>
      <p className="sr-only">
        {done} of {total} doses done today.
      </p>
    </div>
  );
}
