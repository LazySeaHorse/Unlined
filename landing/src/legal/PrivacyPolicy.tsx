import { Link } from '@landing/router';
import { ArrowLeft, ArrowRight, FileCheck2, Shield } from 'lucide-react';
import { useEffect } from 'react';

export function PrivacyPolicy() {
  useEffect(() => {
    document.title = 'Privacy Policy — Unlined';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <article className="mx-auto max-w-3xl px-4 pt-24 pb-20 sm:px-6 sm:pt-28">
      {/* Breadcrumb navigation */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 font-mono text-xs text-muted">
        <Link href="/" className="inline-flex items-center gap-1 transition-colors hover:text-fg">
          <ArrowLeft className="size-3" />
          <span>Home</span>
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-fg">Privacy Policy</span>
      </nav>

      {/* Header */}
      <header className="mb-10 border-b border-line pb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 font-mono text-[11px] text-muted">
            <FileCheck2 className="size-3 text-accent" />
            ASD-STE100 Compliant
          </span>
          <span className="font-mono text-[11px] text-muted">Updated: October 20, 2026</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Unlined Privacy Policy
        </h1>
        <p className="mt-3 text-base text-muted sm:text-lg">
          We write this policy in Simplified Technical English (ASD-STE100). The sentences are short, active,
          and unambiguous.
        </p>

        {/* Quick Summary Callout */}
        <div className="mt-6 rounded-xl border border-line bg-surface-2/60 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
              <Shield className="size-4" />
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-fg">Summary in Plain Words</p>
              <p className="text-muted leading-relaxed">
                Unlined stores your content on your personal device. We cannot read, access, or sell your
                canvases. We do not use third-party tracking cookies or session recorders.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Policy Sections */}
      <div className="space-y-10 text-[15px] leading-relaxed text-fg">
        {/* Section 1 */}
        <section aria-labelledby="section-scope" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-accent">01</span>
            <h2 id="section-scope" className="font-display text-xl font-semibold tracking-tight text-fg">
              Scope of this Policy
            </h2>
          </div>
          <p className="text-muted">
            Unlined is a local-first canvas app for notes, formulas, code, and sketches.
          </p>
          <p className="text-muted">This privacy policy applies to the Unlined web app and website.</p>
          <p className="text-muted">
            The policy explains what data the app stores, what data we collect, and how you control your data.
          </p>
        </section>

        {/* Section 2 */}
        <section aria-labelledby="section-storage" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-accent">02</span>
            <h2 id="section-storage" className="font-display text-xl font-semibold tracking-tight text-fg">
              Local Data Storage
            </h2>
          </div>
          <p className="text-muted">The app stores your personal content directly on your device.</p>
          <p className="text-muted">This content includes:</p>
          <ul className="list-inside list-disc space-y-1.5 pl-2 text-muted">
            <li>Canvases and visual boards.</li>
            <li>Notes, text blocks, and markdown documents.</li>
            <li>Mathematical formulas and graph configurations.</li>
            <li>Code snippets and spreadsheet cells.</li>
            <li>Embedded files, drawings, and uploaded PDF documents.</li>
          </ul>
          <p className="text-muted">The app stores this content in your browser's IndexedDB database.</p>
          <p className="text-muted">We do not operate servers that receive your canvas content.</p>
          <p className="text-muted">We cannot view, read, modify, or sell your canvas data.</p>
          <p className="text-muted">Your content stays in your browser until you delete it.</p>
        </section>

        {/* Section 3 */}
        <section aria-labelledby="section-sync" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-accent">03</span>
            <h2 id="section-sync" className="font-display text-xl font-semibold tracking-tight text-fg">
              Optional Cloud Synchronization
            </h2>
          </div>
          <p className="text-muted">Cloud synchronization is an optional feature.</p>
          <p className="text-muted">The app disables cloud synchronization by default.</p>
          <p className="text-muted">
            Synchronization starts only when you enter JSONBin credentials in settings.
          </p>
          <p className="text-muted">When you use cloud synchronization, the app protects your content:</p>
          <ul className="list-inside list-disc space-y-1.5 pl-2 text-muted">
            <li>Your browser encrypts your canvas data before transmission.</li>
            <li>Your browser uses the AES-GCM encryption algorithm.</li>
            <li>The app derives the encryption key directly from your secret password.</li>
            <li>The app transmits only encrypted ciphertext across the network.</li>
            <li>We do not operate the JSONBin server.</li>
            <li>We do not possess your password or your encryption key.</li>
            <li>The app does not sync images or PDF files to the cloud.</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section aria-labelledby="section-bridge" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-accent">04</span>
            <h2 id="section-bridge" className="font-display text-xl font-semibold tracking-tight text-fg">
              Local Artificial Intelligence Bridge
            </h2>
          </div>
          <p className="text-muted">Unlined provides an optional local AI bridge.</p>
          <p className="text-muted">The bridge connects the app to AI agents on your local computer.</p>
          <p className="text-muted">The bridge uses a local loopback network address (localhost).</p>
          <p className="text-muted">The bridge runs only when you start the bridge program manually.</p>
          <p className="text-muted">
            The bridge does not transmit your canvas content to external third-party servers.
          </p>
          <p className="text-muted">You choose which local AI models interact with your canvas.</p>
        </section>

        {/* Section 5 */}
        <section aria-labelledby="section-analytics" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-accent">05</span>
            <h2 id="section-analytics" className="font-display text-xl font-semibold tracking-tight text-fg">
              Analytics and Telemetry
            </h2>
          </div>
          <p className="text-muted">
            We use the Umami analytics service to measure aggregate site performance. Umami sets no cookies
            and does not follow you across other sites.
          </p>
          <p className="text-muted">We collect only these aggregate metrics:</p>
          <ul className="list-inside list-disc space-y-1.5 pl-2 text-muted">
            <li>The number of visits to each page, and how long visits last.</li>
            <li>The type of your device, operating system, and web browser.</li>
            <li>Your approximate geographic location (country and city only).</li>
          </ul>
          <p className="text-muted">We do not collect these types of data:</p>
          <ul className="list-inside list-disc space-y-1.5 pl-2 text-muted">
            <li>Keystrokes or typed text.</li>
            <li>Content from your canvas, notes, or uploaded files.</li>
            <li>Screen recordings or mouse cursor heatmaps.</li>
            <li>Personal contact details, email addresses, or names.</li>
          </ul>
          <p className="text-muted">The app honors the Do Not Track (DNT) setting in your browser.</p>
          <p className="text-muted">If you enable Do Not Track, the app stops all analytics collection.</p>
        </section>

        {/* Section 6 */}
        <section aria-labelledby="section-rights" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-accent">06</span>
            <h2 id="section-rights" className="font-display text-xl font-semibold tracking-tight text-fg">
              Your Data Rights
            </h2>
          </div>
          <p className="text-muted">You have full ownership and control of your data.</p>
          <p className="text-muted">You can exercise these actions at any time:</p>
          <ul className="list-inside list-disc space-y-2 pl-2 text-muted">
            <li>
              <strong className="text-fg">Export your data:</strong> Select the Export menu option to download
              a JSON file of your canvas.
            </li>
            <li>
              <strong className="text-fg">Delete your data:</strong> Clear the website storage in your browser
              settings to erase all local content.
            </li>
            <li>
              <strong className="text-fg">Stop synchronization:</strong> Clear your JSONBin keys in settings
              to disconnect the cloud service.
            </li>
            <li>
              <strong className="text-fg">Block analytics:</strong> Turn on Do Not Track or install a content
              blocker in your browser.
            </li>
          </ul>
        </section>

        {/* Section 7 */}
        <section aria-labelledby="section-contact" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-accent">07</span>
            <h2 id="section-contact" className="font-display text-xl font-semibold tracking-tight text-fg">
              Contact and Questions
            </h2>
          </div>
          <p className="text-muted">
            If you have questions about this privacy policy, open an issue in our GitHub repository.
          </p>
          <p className="text-muted">
            You can also submit questions through our project communication channels.
          </p>
        </section>
      </div>

      {/* Bottom Navigation Box */}
      <footer className="mt-14 border-t border-line pt-8">
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-sm font-semibold text-fg">Related Document</p>
            <p className="text-xs text-muted">Review our software license and terms of service.</p>
          </div>
          <Link
            href="/terms"
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3.5 py-2 text-xs font-medium text-fg transition-colors hover:bg-line hover:text-accent"
          >
            <span>Read Terms of Use</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </footer>
    </article>
  );
}
