interface Props {
  label: string;
  hint?: string;
  count: number;
  target: number;
  onChange: (count: number) => void;
}

/**
 * One treatment, ticked off a dose at a time.
 *
 * Tapping adds a dose and wraps back to none once the target is passed, so a
 * mis-tap is undone by carrying on rather than by hunting for a minus button —
 * which matters when this is being done at six in the morning over a nebuliser.
 */
export function Stepper({ label, hint, count, target, onChange }: Props) {
  const done = Math.min(count, target);

  return (
    <button
      type="button"
      className={"dose" + (done >= target ? " dose--done" : "")}
      onClick={() => onChange(count >= target ? 0 : count + 1)}
      aria-label={`${label}, ${done} of ${target} done. Tap to tick another off.`}
    >
      <span className="dose__name">
        {label}
        {hint ? <span className="hint"> {hint}</span> : null}
      </span>
      <span className="dose__pips" aria-hidden="true">
        {Array.from({ length: target }, (_, i) => (
          <span key={i} className={"dose__pip" + (i < done ? " dose__pip--on" : "")} />
        ))}
      </span>
    </button>
  );
}
