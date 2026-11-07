import { forwardRef } from 'react';
import { HELP_ORDER, MODE_KEYS, MODE_LABELS, MODE_SUMMARIES, modeHelp } from './modes';

/** The overview of all keyboard shortcuts shown in help mode, made from the key descriptions in modes.ts. */
export const HelpOverlay = forwardRef<HTMLDivElement>(function HelpOverlay(_props, ref) {
  return (
    <div ref={ref} className="help-overlay" role="dialog" aria-label="Keyboard shortcuts">
      <h1>Keyboard shortcuts</h1>
      <p>Type m and then a mode's key to switch to that mode.</p>
      <dl className="help-list">
        {HELP_ORDER.map((mode) => (
          <div key={mode} className="help-row">
            <dt>
              {MODE_LABELS[mode]} (m {MODE_KEYS[mode]}):
            </dt>
            <dd>{MODE_SUMMARIES[mode]}</dd>
          </div>
        ))}
      </dl>
      {HELP_ORDER.map((mode) => (
        <section key={mode}>
          <h2>{MODE_LABELS[mode]} mode</h2>
          <dl className="help-list">
            {modeHelp(mode).map(({ keys, description }) => (
              <div key={keys} className="help-row">
                <dt>{keys}:</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
});
