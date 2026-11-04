import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAiAssist } from '@/ai/store';
import { OnDeviceTab } from './OnDeviceTab';

afterEach(() => vi.unstubAllGlobals());

describe('OnDeviceTab', () => {
  it('switches to a local server, shows its models and fills the address from a preset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'qwen' }, { id: 'llama' }] }))),
    );
    useAiAssist.setState({
      enabled: true,
      provider: 'chrome',
      availability: 'unsupported',
      models: [],
      server: { url: 'http://localhost:1234/v1', model: '', key: '' },
    });
    render(<OnDeviceTab />);
    fireEvent.click(screen.getByRole('radio', { name: 'Local server' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ollama' }));
    expect((screen.getByLabelText('Server address') as HTMLInputElement).value).toBe(
      'http://localhost:11434/v1',
    );
    expect(await screen.findByRole('option', { name: 'llama' })).toBeTruthy();
    expect(await screen.findByText('Connected. Ready.')).toBeTruthy();
  });

  it('warns about an address that is not on this computer', () => {
    useAiAssist.setState({
      enabled: false,
      provider: 'server',
      models: [],
      server: { url: 'http://192.168.1.9:1234/v1', model: '', key: '' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('x'))),
    );
    render(<OnDeviceTab />);
    expect(screen.getByText(/not on this computer/)).toBeTruthy();
  });
});
