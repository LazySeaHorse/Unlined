import { useEffect, useRef, useState } from 'react';
import { useAiAssist } from '@/ai/store';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { Switch } from '@/ui/Switch';

const THINGS = [
  ['Graph', 'In a row, "? downward parabola through (1,-2)" becomes an equation.'],
  ['Math', 'In a field, "? integral of x squared from 0 to 1" becomes LaTeX.'],
  ['Math+', 'Words and values become lines Math+ computes itself, e.g. "? sum the numbers above".'],
  [
    'Text and tables',
    'At the start of a line or a cell, "? one-line definition of eigenvalue" writes it for you.',
  ],
  ['Sheet', 'In the formula bar, "? average of column B" becomes a formula.'],
  ['Code', 'In the editor, "? reverse a string" becomes a snippet.'],
  ['Titles', 'Right-click one or more nodes, Suggest title.'],
] as const;

/** Settings for Chrome's built-in model. This is the only place the model is ever downloaded from. */
export function OnDeviceTab() {
  const { enabled, availability, progress, setEnabled, refresh, download } = useAiAssist();
  const [help, setHelp] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const supported = availability !== 'unsupported' && availability !== 'unavailable';

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = () => {
    abort.current = new AbortController();
    void download(abort.current.signal);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!supported}
          aria-label="Writing help"
        />
        <span className="min-w-0 text-sm">
          <span id="on-device-ai-label" className="font-medium">
            Writing help from Chrome
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            Start a line with <kbd className="font-mono">?</kbd> and say what you want. It runs on this
            computer with Chrome's built-in model, so nothing leaves the device, and it only suggests: you
            accept or dismiss.
          </span>
        </span>
      </div>
      <p className="text-xs text-muted">
        {availability === 'unsupported' &&
          "This browser has no built-in model. It needs desktop Chrome with Chrome's built-in AI."}
        {availability === 'unavailable' && "Chrome's built-in model can't run on this device."}
        {supported && enabled && availability === 'available' && 'Ready.'}
      </p>
      {enabled && availability === 'downloadable' && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">The model downloads once, about 2 GB.</span>
          <Button size="sm" variant="primary" onClick={start}>
            Download
          </Button>
        </div>
      )}
      {enabled && availability === 'downloading' && (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Downloading… {Math.round(progress * 100)}%</span>
            <Button size="xs" onClick={() => abort.current?.abort()}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <Button size="xs" className="self-start" onClick={() => setHelp(true)}>
        What can it do?
      </Button>
      <Modal
        open={help}
        onOpenChange={setHelp}
        title="Writing help"
        description="Start a line with ? and say what you want."
      >
        <ul className="flex flex-col gap-2.5 text-sm">
          {THINGS.map(([name, text]) => (
            <li key={name}>
              <span className="font-medium">{name}</span>
              <span className="block text-xs text-muted">{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          A suggestion shows faintly first. Tab accepts it, Esc dismisses it. The model only writes the
          syntax; Math+, graphs and sheets still do the computing. It is a small model, so check what it gives
          you.
        </p>
      </Modal>
    </div>
  );
}
