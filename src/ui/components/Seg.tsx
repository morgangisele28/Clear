interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  label: string;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Marks the options that should read as a warning rather than a selection. */
  alarmFrom?: number;
}

/**
 * A row of choices where exactly one is picked.
 *
 * Buttons rather than a native select: this is used one-handed on a phone, and
 * a picker that opens a wheel to choose between three things is three taps where
 * one would do.
 */
export function Seg<T extends string | number>({
  label,
  options,
  value,
  onChange,
  alarmFrom,
}: Props<T>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option, i) => (
        <button
          key={String(option.value)}
          type="button"
          className={
            "seg__opt" + (alarmFrom != null && i >= alarmFrom ? " seg__opt--alarm" : "")
          }
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
