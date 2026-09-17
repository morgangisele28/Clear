interface Props {
  label: string;
  value: number | null;
  max: number;
  valueLabel: string;
  hint?: string;
  /** A gradient or colour for the track, where the scale is itself a colour. */
  track?: string;
  onChange: (value: number) => void;
}

/**
 * One of the fixed scales.
 *
 * The number is never shown on its own. A 4 means nothing next to a 5 in six
 * months' time; "yellow" and "a tablespoon" still do, which is the whole reason
 * these scales are anchored to words and objects rather than to numbers.
 */
export function Slider({ label, value, max, valueLabel, hint, track, onChange }: Props) {
  return (
    <div className="slider">
      <div className="slider__head">
        <span className="rowlab">{label}</span>
        <span className="slider__value">
          {valueLabel}
          {hint ? <span className="hint"> · {hint}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={valueLabel}
        style={track ? { background: track } : undefined}
        className={"slider__input" + (value == null ? " slider__input--unset" : "")}
      />
    </div>
  );
}
