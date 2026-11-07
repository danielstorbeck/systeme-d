import { useRef, useState, type CSSProperties } from 'react';
import { formatRatio, parseRatio, type Ratio } from './rulers';

interface RatioLabelProps {
  ratio: Ratio;
  /** The main ruler's label always reads "1". */
  editable: boolean;
  /** Takes the focus when it appears, with its text selected, e.g. for a ruler just derived from the keyboard. */
  autoFocus?: boolean;
  onChange: (ratio: Ratio) => void;
  style: CSSProperties;
}

/**
 * The label at a ruler's left end. For sub-rulers it is an input accepting "1" or "m:n";
 * every valid entry is applied immediately, and an invalid one is dropped on leaving the field.
 */
export function RatioLabel({ ratio, editable, autoFocus, onChange, style }: RatioLabelProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const ratioOnFocus = useRef(ratio);

  if (!editable) {
    return (
      <span className="ratio-label" style={style}>
        1
      </span>
    );
  }

  const invalid = draft !== null && parseRatio(draft) === null;
  return (
    <input
      className={invalid ? 'ratio-label invalid' : 'ratio-label'}
      style={style}
      value={draft ?? formatRatio(ratio)}
      autoFocus={autoFocus}
      spellCheck={false}
      aria-label="Ratio to the ruler this one is derived from: 1 or m:n"
      aria-invalid={invalid}
      title="1 or m:n — m intervals here span n intervals of the parent ruler"
      onFocus={(e) => {
        ratioOnFocus.current = ratio;
        setDraft(formatRatio(ratio));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = parseRatio(e.target.value);
        if (parsed) onChange(parsed);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          onChange(ratioOnFocus.current);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
