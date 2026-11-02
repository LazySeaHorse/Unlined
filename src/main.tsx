import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initAiAssist } from './ai/store';
import { cleanOrphanPdfFiles } from './nodes/pdf/fileStore';
import { ErrorBoundary } from './ui/ErrorScreen';
import './index.css';

registerSW({ immediate: true });
// Linked PDFs whose nodes are gone for good; not worth blocking startup or failing over.
void cleanOrphanPdfFiles().catch(() => {});

initAiAssist();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
