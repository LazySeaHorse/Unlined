import { useEffect, useRef, useState } from 'react';
import { isLoopback, LOCAL_PRESETS } from '@/ai/localServer';
import { useAiAssist } from '@/ai/store';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
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
  [
    'Tab completion',
    'Press Tab while typing in a field for the rest of the line, then Tab again to take it.',
  ],
] as const;

const inputClass =
  'w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm text-fg outline-none focus:border-accent';

/** Settings for the model that answers: Chrome's built-in one, or a server on this computer. This is the only place
 * Chrome's model is ever downloaded from. */
export function OnDeviceTab() {
  const { enabled, availability, progress, provider, setProvider, setEnabled, refresh, download } =
    useAiAssist();
  const [help, setHelp] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const supported =
    provider === 'server' || (availability !== 'unsupported' && availability !== 'unavailable');

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
          disabled={!supported && !enabled}
          aria-label="Writing help"
        />
        <span className="min-w-0 text-sm">
          <span id="on-device-ai-label" className="font-medium">
            Writing help
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            Start a line with <kbd className="font-mono">?</kbd> and say what you want. A model on this
            computer writes it, so nothing goes to the cloud, and it only suggests: you accept or dismiss.
          </span>
        </span>
      </div>
      <div className="flex items-start gap-3">
        <Switch
          checked={provider === 'chrome'}
          onCheckedChange={(on) => setProvider(on ? 'chrome' : 'server')}
          aria-label="Use Chrome's built-in model"
        />
        <span className="min-w-0 text-sm">
          <span className="font-medium">Use Chrome's built-in model</span>
          <span className="mt-0.5 block text-xs text-muted">
            Turn off to use a model server on this computer instead, such as LM Studio or Ollama.
          </span>
        </span>
      </div>
      {provider === 'server' ? (
        <ServerSettings />
      ) : (
        <>
          <p className="text-xs text-muted">
            {availability === 'unsupported' &&
              "This browser has no built-in model. It needs desktop Chrome with Chrome's built-in AI, or use a local server."}
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
        </>
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

/** Where a local model server is, which of its models to use, and whether it can be reached. */
function ServerSettings() {
  const { server, models, serverError, availability, enabled, setServerConfig, refresh } = useAiAssist();
  const [key, setKey] = useState(false);
  const preset = LOCAL_PRESETS.find((p) => p.url === server.url.trim());
  // The chosen model stays in the list even when the server does not offer it (yet), so it is never lost.
  const options = server.model && !models.includes(server.model) ? [server.model, ...models] : models;
  const remote = server.url.trim() !== '' && !isLoopback(server.url);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Any server that speaks the OpenAI API: LM Studio, Ollama, Jan, llama.cpp, KoboldCpp. Start its local
        server and load a model there; Unlined lists what it offers.
      </p>
      <div className="flex flex-wrap gap-1">
        {LOCAL_PRESETS.map((p) => (
          <Button
            key={p.name}
            size="xs"
            variant={preset === p ? 'primary' : 'ghost'}
            onClick={() => setServerConfig({ url: p.url })}
          >
            {p.name}
          </Button>
        ))}
      </div>
      <Field label="Server address" hint="The API root, usually ending in /v1.">
        {(control) => (
          <input
            {...control}
            spellCheck={false}
            value={server.url}
            onChange={(e) => setServerConfig({ url: e.target.value })}
            className={inputClass}
          />
        )}
      </Field>
      <Field label="Model">
        {(control) => (
          <div className="flex gap-2">
            <select
              {...control}
              value={server.model}
              onChange={(e) => setServerConfig({ model: e.target.value })}
              disabled={options.length === 0}
              className={inputClass}
            >
              {options.length === 0 && <option value="">No models found</option>}
              {options.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
        )}
      </Field>
      <Field label="API key (optional)" hint="Local servers rarely need one. It is kept on this device.">
        {(control) => (
          <div className="flex gap-2">
            <input
              {...control}
              type={key ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={server.key}
              onChange={(e) => setServerConfig({ key: e.target.value })}
              className={inputClass}
            />
            <Button size="sm" onClick={() => setKey(!key)}>
              {key ? 'Hide' : 'Show'}
            </Button>
          </div>
        )}
      </Field>
      {remote && (
        <p className="text-xs text-danger">
          This address is not on this computer. What you ask is sent to that server, and a page served over
          https cannot call a plain http address on another machine.
        </p>
      )}
      <p className="text-xs text-muted" role="status">
        {availability === 'available' &&
          (enabled ? 'Connected. Ready.' : 'Connected. Switch on writing help to use it.')}
        {serverError && availability === 'unavailable' && (
          <>
            {serverError === 'unreachable'
              ? `Could not reach ${server.url.trim() || 'the server'}. `
              : `${serverError} `}
            Check that its local server is running and allows requests from this page (CORS, and Chrome may
            ask to allow access to devices on your network: in LM Studio turn on "Enable CORS" under
            Developer; Ollama needs OLLAMA_ORIGINS set to this site; Jan has a CORS option in its server
            settings).
          </>
        )}
      </p>
    </div>
  );
}
