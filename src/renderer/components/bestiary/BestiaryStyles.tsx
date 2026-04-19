/* Styles for the Bestiarium view. Kept inside a single <style> tag so the
   view stays drop-in with zero Vite / PostCSS configuration changes, and
   so the cascade stays scoped to `.bb-best-*` without collisions. Design
   language mirrors CompendiumView — top bar, breadcrumb, language pill —
   so the two reference surfaces feel like siblings. */

export function BestiaryStyles() {
  return (
    <style>{`
      .bb-best {
        display: flex; flex-direction: column;
        height: 100%;
        background: var(--bg-base);
        color: var(--text-primary);
      }
      .bb-best .display {
        font-family: 'Fraunces', 'Iowan Old Style', Georgia, serif;
        font-weight: 500; letter-spacing: -0.01em;
      }
      .bb-best .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

      /* ── Top bar ───────────────────────────────────────────── */
      .bb-best-topbar {
        display: flex; align-items: center; gap: var(--sp-4);
        padding: 0 var(--sp-6); height: 56px;
        background: rgba(13, 16, 21, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
        user-select: none;
      }
      .bb-best-back {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 12px;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-secondary);
        font-size: 12px; font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: border-color var(--transition), color var(--transition);
        flex-shrink: 0;
      }
      .bb-best-back:hover {
        border-color: var(--accent);
        color: var(--accent-light);
      }
      .bb-best-brand {
        display: flex; align-items: center; gap: 8px;
        flex: 1;
        min-width: 0;
      }
      .bb-best-wordmark {
        font-size: 12px; letter-spacing: 0.14em; font-weight: 700;
      }
      .bb-best-breadcrumb-sep { color: var(--text-muted); }
      .bb-best-breadcrumb-name {
        font-size: 13px; font-weight: 500;
        color: var(--text-primary);
      }
      .bb-best-actions {
        display: flex; align-items: center; gap: var(--sp-2);
        flex-shrink: 0;
      }

      .bb-best-search {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px;
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        width: 260px;
      }
      .bb-best-search input {
        flex: 1; min-width: 0;
        background: transparent;
        border: none; outline: none;
        color: var(--text-primary);
        font-size: 12px;
        font-family: inherit;
      }
      .bb-best-search button {
        background: transparent; border: none; cursor: pointer;
        color: var(--text-muted); font-size: 11px; padding: 0 2px;
      }

      .bb-best-lang {
        display: flex;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        overflow: hidden;
      }
      .bb-best-lang button {
        padding: 4px 10px;
        font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
        background: transparent;
        color: var(--text-muted);
        border: none; cursor: pointer;
        font-family: inherit;
      }
      .bb-best-lang button.active {
        background: var(--accent-dim);
        color: var(--accent);
      }

      /* ── Attribution strip ─────────────────────────────────── */
      .bb-best-attribution {
        padding: 6px var(--sp-6);
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border-subtle);
        border: none;
        font-size: 10px;
        color: var(--text-muted);
        line-height: 1.4;
        text-align: left;
        cursor: pointer;
        font-family: inherit;
        width: 100%;
      }
      .bb-best-attribution-link {
        color: var(--accent-blue-light);
        text-decoration: underline;
        text-decoration-style: dotted;
      }

      /* ── Tabs ──────────────────────────────────────────────── */
      .bb-best-tabs {
        display: flex;
        border-bottom: 1px solid var(--border);
        background: var(--bg-surface);
        flex-shrink: 0;
      }
      .bb-best-tab {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 12px 22px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-muted);
        font-family: inherit;
        font-size: 13px; font-weight: 500;
        cursor: pointer;
        transition: color var(--transition), border-color var(--transition);
      }
      .bb-best-tab:hover { color: var(--text-secondary); }
      .bb-best-tab.active {
        color: var(--accent-blue-light);
        border-bottom-color: var(--accent-blue);
        font-weight: 700;
      }
      .bb-best-tab-icon { font-size: 16px; line-height: 1; }

      /* ── Body ──────────────────────────────────────────────── */
      .bb-best-body {
        flex: 1; min-height: 0;
        display: flex;
        overflow: hidden;
      }
      .bb-best-layout {
        flex: 1; min-height: 0;
        display: grid;
        grid-template-columns: 360px 1fr;
        overflow: hidden;
      }

      /* ── List pane (left) ─────────────────────────────────── */
      .bb-best-listpane {
        display: flex; flex-direction: column;
        border-right: 1px solid var(--border);
        background: var(--bg-surface);
        min-height: 0;
      }
      .bb-best-filterbar {
        display: flex; gap: var(--sp-2); flex-wrap: wrap;
        padding: var(--sp-3) var(--sp-4);
        border-bottom: 1px solid var(--border-subtle);
        background: var(--bg-elevated);
        flex-shrink: 0;
      }
      .bb-best-filter {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
        font-weight: 700;
        color: var(--text-muted);
      }
      .bb-best-filter select {
        padding: 3px 6px;
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        font-size: 11px;
        font-family: inherit;
        font-weight: 500;
        letter-spacing: normal;
        text-transform: none;
        cursor: pointer;
      }
      .bb-best-filter-clear {
        padding: 3px 8px;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-muted);
        font-size: 10px;
        font-family: inherit;
        cursor: pointer;
      }
      .bb-best-listcount {
        padding: 8px var(--sp-4) 6px;
        font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
        font-weight: 700;
        color: var(--text-muted);
        background: var(--bg-surface);
        border-bottom: 1px solid var(--border-subtle);
        flex-shrink: 0;
      }
      .bb-best-list {
        list-style: none; margin: 0; padding: 0;
        overflow-y: auto;
        flex: 1;
      }
      .bb-best-list-item {
        display: grid;
        grid-template-columns: 60px 1fr auto;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px var(--sp-4);
        background: transparent;
        border: none;
        border-left: 3px solid transparent;
        color: var(--text-primary);
        text-align: left;
        font-family: inherit;
        font-size: 12px;
        cursor: pointer;
        transition: background var(--transition);
      }
      .bb-best-list-item:hover { background: var(--bg-overlay); }
      .bb-best-list-item.active {
        background: var(--accent-blue-dim);
      }
      .bb-best-list-chip {
        font-size: 12px; font-weight: 700;
        color: var(--text-muted);
        letter-spacing: 0.04em;
      }
      .bb-best-list-body {
        display: flex; flex-direction: column; gap: 2px;
        min-width: 0;
      }
      .bb-best-list-name {
        font-size: 14px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .bb-best-list-meta {
        font-size: 10px; letter-spacing: 0.04em;
        color: var(--text-muted);
      }
      .bb-best-list-count {
        font-size: 10px; color: var(--text-muted);
      }
      .bb-best-list-empty {
        padding: 32px var(--sp-4);
        text-align: center;
        font-size: 12px;
        color: var(--text-muted);
        font-style: italic;
      }

      /* ── Detail pane (right) ──────────────────────────────── */
      .bb-best-detailpane {
        overflow-y: auto;
        padding: var(--sp-5);
        min-height: 0;
        background: var(--bg-base);
      }
      .bb-best-detail {
        max-width: 880px;
        margin: 0 auto;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-left: 4px solid var(--border);
        border-radius: var(--radius-lg);
        padding: var(--sp-5) var(--sp-6);
        display: flex; flex-direction: column; gap: var(--sp-4);
      }

      .bb-best-hero {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: var(--sp-5);
        align-items: center;
      }
      .bb-best-hero-portrait {
        width: 120px; height: 120px;
        border-radius: 50%;
        border: 3px solid var(--border);
        background: var(--bg-elevated);
        overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
      }
      .bb-best-hero-portrait img {
        width: 100%; height: 100%;
        object-fit: cover;
        display: block;
      }
      .bb-best-hero-glyph {
        font-size: 48px;
        opacity: 0.7;
      }
      .bb-best-hero-text { min-width: 0; }
      .bb-best-hero-name {
        font-size: 28px;
        margin: 0 0 4px;
        color: var(--text-primary);
      }
      .bb-best-hero-sub {
        display: flex; gap: 6px; flex-wrap: wrap;
        font-size: 13px;
        color: var(--text-secondary);
        margin-bottom: var(--sp-3);
        font-style: italic;
      }
      .bb-best-hero-dot { color: var(--text-muted); opacity: 0.7; }
      .bb-best-hero-chips {
        display: flex; gap: var(--sp-2); flex-wrap: wrap;
      }
      .bb-best-chip {
        display: inline-flex; align-items: baseline; gap: 6px;
        padding: 4px 10px;
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius);
        font-size: 11px;
      }
      .bb-best-chip-label {
        font-size: 9px; letter-spacing: 0.12em;
        font-weight: 700;
        color: var(--text-muted);
        text-transform: uppercase;
      }
      .bb-best-chip-value {
        color: var(--text-primary);
        font-size: 12px;
        font-weight: 600;
      }

      /* ── Action bar (Add to map / Send to player / …) ─────── */
      .bb-best-actions-bar {
        display: flex; gap: var(--sp-2); flex-wrap: wrap;
        padding: var(--sp-2) 0;
        border-bottom: 1px solid var(--border-subtle);
      }
      .bb-best-action-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 14px;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-primary);
        font-family: inherit; font-size: 12px; font-weight: 600;
        cursor: pointer;
        transition: border-color var(--transition), background var(--transition);
      }
      .bb-best-action-btn:hover:not(:disabled) {
        border-color: var(--accent);
        background: var(--accent-dim);
        color: var(--accent-light);
      }
      .bb-best-action-btn:disabled {
        cursor: not-allowed;
        opacity: 0.4;
      }
      .bb-best-action-primary {
        background: var(--accent);
        color: var(--text-inverse);
        border-color: transparent;
      }
      .bb-best-action-primary:hover:not(:disabled) {
        background: var(--accent-hover);
        color: var(--text-inverse);
        border-color: transparent;
      }

      /* ── Token strip ──────────────────────────────────────── */
      .bb-best-tokens {
        display: flex; gap: 6px;
        overflow-x: auto;
        padding: var(--sp-2);
        background: var(--bg-elevated);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-subtle);
      }
      .bb-best-token {
        flex-shrink: 0;
        width: 48px; height: 48px;
        border-radius: var(--radius-sm);
        border: 2px solid transparent;
        background: var(--bg-base);
        cursor: pointer;
        padding: 0;
        overflow: hidden;
      }
      .bb-best-token:hover { border-color: var(--border); }
      .bb-best-token.active {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px rgba(255, 198, 46, 0.25);
      }
      .bb-best-token img {
        width: 100%; height: 100%;
        object-fit: cover;
        display: block;
      }
      .bb-best-token-skeleton {
        display: block;
        width: 100%; height: 100%;
        background: linear-gradient(
          90deg,
          var(--bg-base),
          var(--bg-elevated),
          var(--bg-base)
        );
        background-size: 200% 100%;
        animation: bb-best-skeleton 1.4s linear infinite;
      }
      @keyframes bb-best-skeleton {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      /* ── Abilities ────────────────────────────────────────── */
      .bb-best-abilities {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: var(--sp-2);
        padding: var(--sp-3);
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
      }
      .bb-best-ability {
        text-align: center;
        padding: 6px 4px;
      }
      .bb-best-ability-label {
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.1em;
        color: var(--text-muted);
        margin-bottom: 2px;
      }
      .bb-best-ability-score {
        font-size: 20px; font-weight: 600;
        color: var(--text-primary);
        line-height: 1;
      }
      .bb-best-ability-mod {
        font-size: 12px;
        color: var(--accent-blue-light);
        margin-top: 2px;
      }

      /* ── Metadata grid ────────────────────────────────────── */
      .bb-best-metagrid {
        display: flex; flex-direction: column;
        gap: 4px;
      }
      .bb-best-metarow {
        display: grid;
        grid-template-columns: 160px 1fr;
        gap: var(--sp-3);
        align-items: baseline;
        padding: 6px 0;
        border-bottom: 1px solid var(--border-subtle);
        font-size: 12px;
      }
      .bb-best-metarow:last-child { border-bottom: none; }
      .bb-best-metarow-label {
        font-size: 10px; letter-spacing: 0.08em;
        font-weight: 700;
        color: var(--text-muted);
        text-transform: uppercase;
      }
      .bb-best-metarow-value {
        color: var(--text-primary);
        line-height: 1.4;
      }

      /* ── Sections ─────────────────────────────────────────── */
      .bb-best-section {
        padding-top: var(--sp-3);
        border-top: 1px solid var(--border-subtle);
      }
      .bb-best-section h3 {
        font-family: 'Fraunces', Georgia, serif;
        font-size: 16px; font-weight: 600;
        margin: 0 0 var(--sp-2);
        color: var(--accent);
        letter-spacing: -0.005em;
      }
      .bb-best-section ul {
        list-style: none; margin: 0; padding: 0;
        display: flex; flex-direction: column; gap: var(--sp-2);
      }
      .bb-best-section li {
        font-size: 13px;
        line-height: 1.55;
        color: var(--text-primary);
      }
      .bb-best-named-title {
        font-weight: 700;
        color: var(--accent-blue-light);
        font-style: italic;
      }
      .bb-best-named-text {
        color: var(--text-secondary);
      }
      .bb-best-prose {
        font-size: 13px;
        line-height: 1.6;
        color: var(--text-secondary);
        white-space: pre-wrap;
      }

      /* ── Footer ───────────────────────────────────────────── */
      .bb-best-footer {
        display: flex; gap: 6px; align-items: center;
        padding-top: var(--sp-3);
        border-top: 1px solid var(--border-subtle);
        font-size: 10px;
        color: var(--text-muted);
        letter-spacing: 0.02em;
      }
      .bb-best-footer-dot { opacity: 0.6; }

      /* ── States ───────────────────────────────────────────── */
      .bb-best-loading {
        padding: 48px;
        text-align: center;
        color: var(--text-muted);
        font-size: 24px;
      }
      .bb-best-error {
        padding: var(--sp-3) var(--sp-4);
        margin: var(--sp-4);
        background: rgba(239, 68, 68, 0.12);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: var(--radius);
        color: var(--danger);
        font-size: 13px;
      }
      .bb-best-empty {
        height: 100%;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: var(--sp-3);
        color: var(--text-muted);
      }
      .bb-best-empty-glyph {
        font-size: 56px;
        opacity: 0.5;
      }
      .bb-best-empty-text {
        font-size: 13px;
        font-style: italic;
      }

      /* ── Responsive ───────────────────────────────────────── */
      @media (max-width: 960px) {
        .bb-best-layout {
          grid-template-columns: 280px 1fr;
        }
        .bb-best-hero {
          grid-template-columns: 88px 1fr;
        }
        .bb-best-hero-portrait {
          width: 88px; height: 88px;
        }
        .bb-best-hero-name { font-size: 22px; }
        .bb-best-metarow { grid-template-columns: 120px 1fr; }
      }
    `}</style>
  )
}
