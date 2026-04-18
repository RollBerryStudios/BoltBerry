import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import pkg from '../../../package.json'

/* About dialog — single authoritative surface for attributions and legal
   notices. Required by CC-BY-4.0 for the SRD content; nice-to-have for
   too-many-tokens (explicitly released license-free, but we credit it
   anyway). Reachable from the native menu's About action and from a
   small ℹ button on the Welcome screen. */

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()

  // Escape closes the dialog; matches the other modals in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="bb-about-backdrop" onClick={onClose}>
      <div className="bb-about" onClick={(e) => e.stopPropagation()}>
        <AboutStyles />

        <header className="bb-about-header">
          <div className="bb-about-brand">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" fill="var(--accent)" />
            </svg>
            <div>
              <div className="bb-about-title display">BoltBerry</div>
              <div className="bb-about-sub">v{pkg.version} · {t('about.tagline')}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="bb-about-close" title={t('about.close')}>
            ✕
          </button>
        </header>

        <div className="bb-about-body">
          {/* App licence */}
          <section>
            <h3 className="bb-about-section-title">{t('about.appLicence')}</h3>
            <p className="bb-about-text">
              {t('about.appLicenceBody')}
              {' '}
              <a
                className="bb-about-link"
                href="https://github.com/RollBerry-Studios/BoltBerry/blob/main/LICENSE"
                target="_blank"
                rel="noreferrer"
              >
                MIT License
              </a>
              {' '}© 2026 RollBerry Studios.
            </p>
          </section>

          {/* SRD attribution — required by CC-BY-4.0 */}
          <section>
            <h3 className="bb-about-section-title">{t('about.srdTitle')}</h3>
            <p className="bb-about-text">
              {t('about.srdBody1')}{' '}
              <strong>Wizards of the Coast LLC</strong>{t('about.srdBody2')}{' '}
              <a
                className="bb-about-link"
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                Creative Commons Attribution 4.0 International (CC-BY-4.0)
              </a>
              .
            </p>
            <p className="bb-about-text">
              {t('about.srdModifications')}
            </p>
            <p className="bb-about-disclaimer">
              {t('about.srdDisclaimer')}
            </p>
          </section>

          {/* Token artwork attribution — voluntary credit */}
          <section>
            <h3 className="bb-about-section-title">{t('about.tokenArtTitle')}</h3>
            <p className="bb-about-text">
              {t('about.tokenArtBody')}{' '}
              <a
                className="bb-about-link"
                href="https://github.com/IsThisMyRealName/too-many-tokens-dnd"
                target="_blank"
                rel="noreferrer"
              >
                IsThisMyRealName/too-many-tokens-dnd
              </a>
              {' · '}
              <a
                className="bb-about-link"
                href="https://toomanytokens.com/"
                target="_blank"
                rel="noreferrer"
              >
                toomanytokens.com
              </a>
              .
            </p>
            <p className="bb-about-text" style={{ fontStyle: 'italic' }}>
              "{t('about.tokenArtQuote')}"
            </p>
          </section>

          {/* Further credits */}
          <section>
            <h3 className="bb-about-section-title">{t('about.creditsTitle')}</h3>
            <p className="bb-about-text">
              {t('about.creditsBody')}
            </p>
            <ul className="bb-about-list">
              <li>Electron, React, TypeScript — app framework</li>
              <li>pdfjs-dist — PDF rendering (Apache 2.0)</li>
              <li>better-sqlite3 — local database (MIT)</li>
              <li>Konva / react-konva — canvas rendering (MIT)</li>
              <li>Zustand — state management (MIT)</li>
              <li>i18next — internationalisation (MIT)</li>
            </ul>
          </section>

          {/* Full notice pointer */}
          <section>
            <p className="bb-about-text bb-about-footnote">
              {t('about.fullNotice')}{' '}
              <a
                className="bb-about-link"
                href="https://github.com/RollBerry-Studios/BoltBerry/blob/main/NOTICE.md"
                target="_blank"
                rel="noreferrer"
              >
                NOTICE.md
              </a>
              .
            </p>
          </section>
        </div>

        <footer className="bb-about-footer">
          <button type="button" onClick={onClose} className="bb-about-ok">
            {t('about.close')}
          </button>
        </footer>
      </div>
    </div>
  )
}

function AboutStyles() {
  return (
    <style>{`
      .bb-about-backdrop {
        position: fixed; inset: 0; z-index: 9960;
        background: rgba(0, 0, 0, 0.72);
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
        animation: bb-about-fade 160ms ease;
      }
      @keyframes bb-about-fade {
        from { opacity: 0; } to { opacity: 1; }
      }
      .bb-about {
        width: min(640px, 94vw);
        max-height: 86vh;
        display: flex; flex-direction: column;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: 0 32px 80px rgba(0, 0, 0, 0.7);
        overflow: hidden;
      }
      .bb-about-header {
        display: flex; align-items: center; justify-content: space-between;
        gap: var(--sp-3);
        padding: var(--sp-4) var(--sp-5);
        border-bottom: 1px solid var(--border-subtle);
        background: linear-gradient(180deg, var(--bg-elevated), transparent);
      }
      .bb-about-brand {
        display: flex; align-items: center; gap: var(--sp-3);
      }
      .bb-about-title {
        font-family: 'Fraunces', 'Iowan Old Style', Georgia, serif;
        font-size: 22px; font-weight: 500; letter-spacing: -0.01em;
        color: var(--text-primary);
      }
      .bb-about-sub {
        font-size: 11px; color: var(--text-muted);
        letter-spacing: 0.04em;
      }
      .bb-about-close {
        background: transparent; border: none; cursor: pointer;
        color: var(--text-muted);
        font-size: 16px; padding: 4px 8px;
        border-radius: var(--radius-sm);
        transition: background var(--transition), color var(--transition);
      }
      .bb-about-close:hover { background: var(--bg-overlay); color: var(--text-primary); }

      .bb-about-body {
        flex: 1; min-height: 0;
        overflow-y: auto;
        padding: var(--sp-5);
        display: flex; flex-direction: column; gap: var(--sp-5);
      }
      .bb-about-section-title {
        font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
        font-weight: 700;
        color: var(--accent);
        margin: 0 0 var(--sp-2);
      }
      .bb-about-text {
        font-size: 12px;
        color: var(--text-primary);
        line-height: 1.6;
        margin: 0 0 var(--sp-2);
      }
      .bb-about-link {
        color: var(--accent-blue-light);
        text-decoration: underline;
        text-decoration-style: dotted;
      }
      .bb-about-link:hover { color: var(--accent-blue); }
      .bb-about-disclaimer {
        font-size: 11px;
        color: var(--text-muted);
        font-style: italic;
        line-height: 1.5;
        padding: var(--sp-2) var(--sp-3);
        background: var(--bg-elevated);
        border-left: 2px solid var(--border);
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      }
      .bb-about-list {
        margin: 0;
        padding-left: var(--sp-4);
        font-size: 12px;
        color: var(--text-secondary);
        line-height: 1.6;
      }
      .bb-about-footnote {
        font-size: 11px;
        color: var(--text-muted);
      }

      .bb-about-footer {
        padding: var(--sp-3) var(--sp-5);
        border-top: 1px solid var(--border-subtle);
        display: flex; justify-content: flex-end;
      }
      .bb-about-ok {
        padding: 7px 18px;
        background: var(--accent);
        color: var(--text-inverse);
        border: none; border-radius: var(--radius);
        font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
        cursor: pointer; font-family: inherit;
      }
      .bb-about-ok:hover { background: var(--accent-hover); }
    `}</style>
  )
}
