const styleElement = document.createElement("style");
document.head.appendChild(styleElement);

const addStyles = (styles: string) => {
  styleElement.textContent += styles;
};

addStyles(`
  :root {
    color-scheme: light;
    /* Layout grid: margins + gutter (compact panel) */
    --grid-unit: 10px;
    --margin-page-top: calc(var(--grid-unit) * 1.2);    /* 12px */
    --margin-page-sides: calc(var(--grid-unit) * 1.6);  /* 16px */
    --margin-page-bottom: calc(var(--grid-unit) * 2.4); /* 24px */
    --gutter: var(--grid-unit);                         /* 10pt */
    --space-focal: calc(var(--grid-unit) * 2);          /* 20px — around primary action */
    /* Surfaces: value ladder — primary (page) < accent (hover/raised) < secondary (cards) for clear depth */
    --bg-primary: #F8FAFC;   /* slate-50: page ground, slight cool tint vs pure white */
    --bg-secondary: #FFFFFF; /* cards and inputs: comes forward on primary */
    --bg-accent: #F1F5F9;    /* slate-100: hover, disabled, progress trail — distinct from primary */
    --text-primary: #0F172A; /* slate-900: high contrast, "shout" */
    --text-secondary: #475569; /* slate-600: body, "whisper" */
    --text-muted: #64748B;   /* slate-500: captions, hints */
    --border-subtle: #E2E8F0; /* slate-200: boundaries without weight */
    /* Brand: primary = impact; secondary = hover/vibrancy */
    --brand-primary: #2563EB;
    --brand-secondary: #3B82F6;
    --brand-focus-ring: rgba(37, 99, 235, 0.35);
    /* Semantic status: high-contrast foreground on tint (light) / shade (dark) for badges and cards */
    --status-success: #059669;
    --status-success-bg: #D1FAE5;
    --status-warning: #D97706;
    --status-warning-bg: #FEF3C7;
    --status-error: #DC2626;
    --status-error-bg: #FEE2E2;
    --status-pending: #64748B;
    --status-pending-bg: #F1F5F9;
    /* Toast: neutral dark for info; semantic for success/error */
    --toast-info-bg: #374151;
    --toast-text: #FFFFFF;
    /* Typography: scale (11 → 12 → 13 → 14 → 18 → 20). rem for 1.4.4 Resize Text. Reading (summary/content) uses --text-lg (14px) for legibility. */
    --font-primary: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --text-xs: 0.6875rem;   /* 11px — reserved for tight UI only */
    --text-sm: 0.75rem;     /* 12px — captions, hints, meta (audit: avoid <12px for copy) */
    --text-base: 0.8125rem; /* 13px — body, controls */
    --text-lg: 0.875rem;    /* 14px — reading (summary/content), lead, primary buttons */
    --measure-reading: 75ch; /* optimal line length for summary/content in wide panels */
    --text-xl: 1.125rem;     /* 18px — section titles */
    --text-2xl: 1.25rem;     /* 20px — panel title (display) */
    --line-height-body: 1.5;
    --line-height-content: 1.55;
    /* Spacing: 4pt base grid, slightly reduced for denser layout */
    --space-xs: 4px;
    --space-sm: 6px;
    --space-md: 10px;
    --space-lg: 14px;
    --space-xl: 20px;
    --space-2xl: 26px;
    /* Radius: compact progression */
    --radius-sm: 3px;
    --radius-md: 6px;
    --radius-lg: 10px;
    --z-base: 0;
    --z-dropdown: 10;
    --z-toast: 50;
    /* Touch target (2.5.5 AAA), focus, motion */
    --touch-min: 44px;
    --focus-ring-width: 2px;
    --focus-ring-width-strong: 3px;
    --transition-fast: 150ms;
    --transition-base: 200ms;
    --transition-slow: 300ms;
    /* Component proportions (from 4pt grid) */
    --icon-size-dot: 8px;
    --scrollbar-width: 6px;
    /* Card footer icons: one neutral color, one hover; stop uses red */
    --icon-footer: var(--text-muted);
    --icon-footer-hover: var(--text-secondary);
    --icon-footer-hover-bg: var(--bg-accent);
    --icon-stop: var(--status-error);
  }

  @media (prefers-reduced-motion: reduce) {
    :root {
      --transition-fast: 0ms;
      --transition-base: 0ms;
      --transition-slow: 0ms;
    }
  }

  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      /* Dark: light-on-dark advances; value ladder inverts — darker = recede, lighter = focal */
      --bg-primary: #0F172A;   /* slate-900: page ground (cool, aligns with text family) */
      --bg-secondary: #1E293B; /* slate-800: cards advance slightly */
      --bg-accent: #334155;    /* slate-700: hover/raised, distinct from secondary */
      --text-primary: #F8FAFC; /* slate-50: maximum legibility */
      --text-secondary: #CBD5E1; /* slate-300 */
      --text-muted: #94A3B8;   /* slate-400 */
      --border-subtle: #475569; /* slate-600 */
      --brand-primary: #60A5FA;
      --brand-secondary: #93C5FD;
      --brand-focus-ring: rgba(96, 165, 250, 0.4);
      /* Status: luminous text on deep shade — balanced for "glow" without losing legibility */
      --status-success: #34D399;
      --status-success-bg: #064E3B;
      --status-warning: #FBBF24;
      --status-warning-bg: #451A03;
      --status-error: #F87171;
      --status-error-bg: #450A0A;
      --status-pending: #94A3B8;
      --status-pending-bg: #334155;
      --toast-info-bg: #475569;
    }
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }
  html, body {
    overflow-y: auto;
    scrollbar-width: thin;
    -ms-overflow-style: none;
  }
  html::-webkit-scrollbar, body::-webkit-scrollbar {
    width: var(--scrollbar-width);
  }
  html::-webkit-scrollbar-thumb {
    background: var(--text-muted);
    border-radius: var(--radius-sm);
  }

  body {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-primary);
    font-size: var(--text-base);
    line-height: var(--line-height-body);
    margin: 0;
    padding: var(--margin-page-top) var(--margin-page-sides) var(--margin-page-bottom);
    min-height: 100vh;
    box-sizing: border-box;
  }

  /* Header — left-aligned; compact scale (2xl display vs xs subtitle) */
  .panel-header {
    padding: 0 0 var(--space-sm);
    text-align: left;
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: var(--space-md);
  }
  .panel-title {
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }
  .panel-subtitle {
    margin: var(--space-xs) 0 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-weight: 500;
  }

  .panel-main {
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    /* Differentiated spacing: compact setup, then focal block, then history */
  }

  /* 현재 작업 상태 (모델 다운로드 | 요약 진행) — 상태 밴드: 좌측 강조선 + 배경으로 카드와 구분 */
  #currentOperation.current-operation {
    display: none;
    flex-direction: column;
    align-items: stretch;
    padding: var(--space-md) var(--gutter);
    margin: 0 0 var(--space-md);
    background: var(--bg-accent);
    border: none;
    border-left: 4px solid var(--brand-primary);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }
  #currentOperation.current-operation[aria-hidden="false"] {
    display: flex;
  }
  .current-operation .operation-pane {
    display: none;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-sm);
  }
  .current-operation .operation-pane[aria-hidden="false"] {
    display: flex;
  }
  .current-operation .operation-summary {
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-md);
    min-height: 2.25rem;
  }
  .model-status-text {
    margin: 0 0 var(--space-xs);
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--text-primary);
  }
  #loadingContainer.loading-bar-container {
    width: 100%;
    height: var(--scrollbar-width);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--bg-secondary);
  }

  .model-select-section {
    padding: var(--space-xs) 0 var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .model-select-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-secondary);
  }
  .model-onboarding-steps {
    display: flex;
    gap: var(--space-md);
    margin: 0 0 var(--space-xs);
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
  .model-onboarding-steps .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1rem;
    height: 1rem;
    margin-right: var(--space-xs);
    background: var(--brand-primary);
    color: var(--toast-text);
    font-weight: 700;
    font-size: 0.625rem;
    border-radius: 50%;
    vertical-align: middle;
  }
  .model-onboarding-steps.model-ready {
    opacity: 0.5;
  }
  .model-select {
    width: 100%;
    min-height: var(--touch-min);
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--text-base);
    font-family: var(--font-primary);
    color: var(--text-primary);
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .model-select:focus-visible {
    outline: none;
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 var(--focus-ring-width) var(--brand-focus-ring);
  }
  .model-select-hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  #inputContainer.input-section {
    padding: var(--space-focal) 0;
    display: flex;
    justify-content: stretch;
  }

  #extract-button.btn-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    width: 100%;
    min-height: var(--touch-min);
    touch-action: manipulation;
    padding: var(--space-sm) var(--space-lg);
    background-color: var(--brand-primary);
    color: var(--toast-text);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-base);
    font-weight: 600;
    font-family: var(--font-primary);
    transition: background-color var(--transition-base) ease, box-shadow var(--transition-base) ease;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }
  #extract-button.btn-primary:hover:not(:disabled) {
    background-color: var(--brand-secondary);
    box-shadow: 0 2px 6px var(--brand-focus-ring);
  }
  #extract-button.btn-primary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 var(--focus-ring-width-strong) var(--brand-focus-ring);
  }
  #extract-button.btn-primary:disabled {
    background-color: var(--text-muted);
    cursor: not-allowed;
    box-shadow: none;
  }

  /* 모델 미준비 시 강조 (첫 설정용) */
  #model-download-button.btn-download-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    min-height: var(--touch-min);
    padding: var(--space-xs) var(--space-md);
    margin-top: var(--space-xs);
    background: var(--brand-primary);
    color: var(--toast-text);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 600;
    font-family: var(--font-primary);
    transition: background-color var(--transition-base) ease, box-shadow var(--transition-base) ease;
    box-shadow: 0 1px 2px var(--brand-focus-ring);
  }
  #model-download-button.btn-download-primary:hover:not(:disabled) {
    background: var(--brand-secondary);
    box-shadow: 0 2px 6px var(--brand-focus-ring);
  }
  #model-download-button.btn-download-primary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 var(--focus-ring-width-strong) var(--brand-focus-ring);
  }
  #model-download-button.btn-download-primary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    box-shadow: none;
  }
  /* 모델 준비 후에는 보조 스타일로 전환 (JS에서 class 전환) */
  #model-download-button.btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    min-height: var(--touch-min);
    padding: var(--space-xs) var(--space-sm);
    margin-top: var(--space-xs);
    background: var(--bg-accent);
    color: var(--text-primary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 500;
    font-family: var(--font-primary);
    transition: background-color var(--transition-base) ease, border-color var(--transition-base) ease;
  }
  #model-download-button.btn-secondary:hover:not(:disabled) {
    background: var(--bg-secondary);
    border-color: var(--brand-primary);
  }
  #model-download-button.btn-secondary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 var(--focus-ring-width) var(--brand-focus-ring);
  }
  #model-download-button.btn-secondary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  #global-step-message.global-step-message {
    display: none;
    margin: 0;
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--text-primary);
    text-align: left;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #global-step-message.global-step-message:not(:empty) {
    display: block;
  }

  #loading-indicator.loading-dots {
    display: none;
    flex-shrink: 0;
    position: relative;
    width: var(--icon-size-dot);
    height: var(--icon-size-dot);
    border-radius: 50%;
    background-color: var(--brand-primary);
    animation: dot-flashing 1s infinite linear alternate;
    animation-delay: 0.5s;
  }
  #loading-indicator.loading-dots::before,
  #loading-indicator.loading-dots::after {
    content: '';
    position: absolute;
    top: 0;
    width: var(--icon-size-dot);
    height: var(--icon-size-dot);
    border-radius: 50%;
    background-color: var(--brand-primary);
  }
  #loading-indicator.loading-dots::before {
    left: calc(-1 * (var(--icon-size-dot) + var(--space-xs)));
    animation: dot-flashing 1s infinite alternate;
    animation-delay: 0s;
  }
  #loading-indicator.loading-dots::after {
    left: calc(var(--icon-size-dot) + var(--space-xs));
    animation: dot-flashing 1s infinite alternate;
    animation-delay: 1s;
  }
  @keyframes dot-flashing {
    0% { opacity: 1; }
    50%, 100% { opacity: 0.35; }
  }
  @media (prefers-reduced-motion: reduce) {
    #loading-indicator.loading-dots,
    #loading-indicator.loading-dots::before,
    #loading-indicator.loading-dots::after {
      animation: none;
      opacity: 0.8;
    }
  }

  #historyWrapper.history-section {
    padding: var(--space-md) 0 0;
    border-top: 1px solid var(--border-subtle);
  }

  .history-item {
    padding: var(--space-md);
    margin-bottom: var(--space-md);
    border-bottom: 1px solid var(--border-subtle);
    font-family: var(--font-primary);
  }
  .history-item:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }

  .section-container {
    position: relative;
    margin-bottom: var(--space-md);
    min-width: 0;
  }

  .summary-text {
    overflow: hidden;
    transition: max-height var(--transition-slow) ease-out;
    line-height: var(--line-height-content);
    transform: translateZ(0);
    color: var(--text-primary);
    font-size: var(--text-lg);
    max-width: var(--measure-reading);
  }

  .content-text {
    position: relative;
    line-height: var(--line-height-content);
    color: var(--text-secondary);
    font-size: var(--text-base);
  }

  .content-title {
    position: relative;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-xs);
    font-weight: 700;
    font-size: var(--text-base);
    margin-bottom: var(--space-xs);
    color: var(--text-primary);
    padding-bottom: var(--space-lg);
    min-width: 0;
  }
  .content-title-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .content-body {
    color: var(--text-secondary);
    line-height: var(--line-height-content);
    margin-top: var(--space-xs);
    white-space: pre-wrap;
    font-size: var(--text-lg);
    max-width: var(--measure-reading);
  }

  .content-text.expanded {
    max-height: none;
  }

  .toggle-button {
    position: absolute;
    bottom: 0;
    right: 0;
    min-height: 36px;
    min-width: 3rem;
    padding: var(--space-xs) var(--space-sm);
    background: none;
    border: none;
    color: var(--brand-primary);
    cursor: pointer;
    touch-action: manipulation;
    font-size: var(--text-sm);
    font-weight: 500;
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast) ease, background-color var(--transition-fast) ease;
  }
  .toggle-button:hover {
    color: var(--brand-secondary);
    background: var(--bg-accent);
  }
  .toggle-button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 var(--focus-ring-width) var(--brand-focus-ring);
  }

  .meta-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: var(--space-sm);
    padding-top: var(--space-xs);
    border-top: 1px solid var(--border-subtle);
    margin-top: 2px;
  }

  .history-timestamp {
    font-size: var(--text-sm);
    color: var(--text-muted);
    align-self: center;
  }

  .meta-actions {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
  }
  .meta-actions .copy-button,
  .meta-actions .retry-button,
  .meta-actions .stop-button,
  .meta-actions .delete-button {
    border-radius: var(--radius-md);
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: var(--text-sm);
    font-weight: 600;
    border-radius: var(--radius-md);
    padding: 2px var(--space-sm);
    margin-right: var(--space-xs);
    margin-bottom: 0;
  }
  .badge-pending {
    background: var(--status-pending-bg);
    color: var(--status-pending);
  }
  .badge-inprogress {
    background: var(--status-warning-bg);
    color: var(--status-warning);
  }
  .badge-done {
    background: var(--status-success-bg);
    color: var(--status-success);
  }
  .badge-error {
    background: var(--status-error-bg);
    color: var(--status-error);
  }

  .feedback-buttons {
    display: inline-flex;
    gap: var(--space-xs);
  }
  .feedback-btn {
    min-width: var(--touch-min);
    min-height: var(--touch-min);
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: color var(--transition-fast) ease, background-color var(--transition-fast) ease;
  }
  .feedback-btn:hover {
    color: var(--text-primary);
    background: var(--bg-accent);
  }
  .feedback-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 var(--focus-ring-width) var(--brand-focus-ring);
  }

  .copy-button,
  .retry-button,
  .stop-button,
  .start-summary-button,
  .delete-button {
    font-size: var(--text-base);
    border: none;
    background: transparent;
    cursor: pointer;
    min-width: var(--touch-min);
    min-height: var(--touch-min);
    padding: 0;
    touch-action: manipulation;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast) ease, background-color var(--transition-fast) ease;
  }
  .copy-button,
  .retry-button,
  .delete-button {
    color: var(--icon-footer);
  }
  .copy-button:hover:not(:disabled),
  .retry-button:hover:not(:disabled),
  .delete-button:hover:not(:disabled) {
    color: var(--icon-footer-hover);
    background: var(--icon-footer-hover-bg);
  }
  .stop-button {
    color: var(--icon-stop);
  }
  .stop-button:hover {
    color: var(--icon-stop);
    background: var(--icon-footer-hover-bg);
  }
  .copy-button:focus-visible,
  .retry-button:focus-visible,
  .stop-button:focus-visible,
  .delete-button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 var(--focus-ring-width) var(--brand-focus-ring);
  }
  .copy-button:disabled,
  .retry-button:disabled,
  .delete-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .status-badge,
  .history-timestamp,
  .meta-actions {
    font-size: var(--text-sm);
  }

  .content-text {
    font-size: var(--text-base);
  }

  .summary-error {
    color: var(--status-error);
    font-size: var(--text-sm);
    margin: 0;
    padding: var(--space-sm) 0;
    line-height: var(--line-height-body);
  }

  .history-empty {
    text-align: center;
    padding: var(--space-lg) var(--space-md);
    color: var(--text-secondary);
  }
  .history-empty-text {
    margin: 0 0 var(--space-xs);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
  }
  .history-empty-hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
  .history-empty-hint strong {
    color: var(--text-primary);
  }
  .history-empty-capability {
    margin: var(--space-md) auto 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: var(--line-height-body);
    max-width: 18rem;
    padding: 0 var(--space-xs);
  }

  .history-item.status-in-progress {
    border-left: 3px solid var(--status-warning);
    padding-left: calc(var(--space-md) - 3px);
    background: var(--status-warning-bg);
  }
  .history-item.status-error {
    border-left: 3px solid var(--status-error);
    padding-left: calc(var(--space-md) - 3px);
    background: var(--status-error-bg);
  }
  .history-item.status-done {
    border-left: 3px solid var(--status-success);
    padding-left: calc(var(--space-md) - 3px);
    background: var(--status-success-bg);
  }
  .history-item.status-pending {
    border-left: 3px solid var(--status-pending);
    padding-left: calc(var(--space-md) - 3px);
    background: var(--status-pending-bg);
  }

  .content-title a {
    flex-shrink: 0;
    color: var(--brand-primary);
    margin-left: 0;
    text-decoration: none;
    padding: var(--space-xs);
    margin-left: var(--space-xs);
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast) ease, background-color var(--transition-fast) ease;
  }
  .content-title a:hover {
    color: var(--brand-secondary);
    background: var(--bg-accent);
  }
  .content-title a:focus-visible {
    outline: none;
    box-shadow: 0 0 0 var(--focus-ring-width) var(--brand-focus-ring);
  }

  /* 1.4.10 Reflow: layout reflows down to 320px; min-width from scale (16×16 ≈ 256) */
  @media (max-width: 400px) {
    .history-item {
      min-width: 16rem;
    }
  }

  /* Delete confirmation modal */
  .delete-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    opacity: 0;
    visibility: hidden;
    transition: opacity var(--transition-base) ease, visibility var(--transition-base) ease;
  }
  .delete-modal-backdrop.delete-modal-visible {
    opacity: 1;
    visibility: visible;
  }
  .delete-modal {
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    max-width: 90vw;
    width: 16rem;
    box-shadow: 0 var(--space-sm) var(--space-lg) rgba(0, 0, 0, 0.12);
    border: 1px solid var(--border-subtle);
  }
  .delete-modal-title {
    margin: 0 0 var(--space-xs);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
  }
  .delete-modal-text {
    margin: 0 0 var(--space-md);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }
  .delete-modal-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
  }
  .btn-secondary {
    min-height: var(--touch-min);
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-accent);
    color: var(--text-primary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    font-family: var(--font-primary);
    cursor: pointer;
    transition: background-color var(--transition-fast) ease, border-color var(--transition-fast) ease, box-shadow var(--transition-fast) ease;
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-secondary);
    border-color: var(--brand-primary);
  }
  .btn-secondary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 var(--focus-ring-width) var(--brand-focus-ring);
  }
  .btn-secondary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  .delete-modal-actions .btn-secondary {
    margin-top: 0;
  }
  .btn-danger {
    min-height: var(--touch-min);
    padding: var(--space-xs) var(--space-sm);
    background: var(--status-error);
    color: var(--toast-text);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: opacity var(--transition-fast) ease, background-color var(--transition-fast) ease;
  }
  .btn-danger:hover {
    opacity: 0.9;
    background: var(--status-error);
  }
  .btn-danger:focus-visible {
    outline: none;
    box-shadow: 0 0 0 var(--focus-ring-width) var(--status-error);
  }

  /* Toast */
  #toast-container.toast {
    position: fixed;
    left: 50%;
    bottom: var(--space-lg);
    transform: translateX(-50%);
    min-width: 10rem;
    max-width: 80vw;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    color: var(--toast-text);
    font-size: var(--text-sm);
    line-height: var(--line-height-body);
    text-align: center;
    z-index: var(--z-toast);
    opacity: 0.98;
    box-shadow: 0 var(--space-xs) var(--space-md) rgba(0, 0, 0, 0.2);
    display: none;
    transition: opacity var(--transition-base) ease;
  }
  #toast-container.toast:focus-visible {
    outline: 2px solid var(--toast-text);
    outline-offset: 2px;
  }
  #toast-container.toast-info {
    background: var(--toast-info-bg);
  }
  #toast-container.toast-success {
    background: var(--status-success);
  }
  #toast-container.toast-error {
    background: var(--status-error);
  }
  @media (prefers-reduced-motion: reduce) {
    #toast-container.toast {
      transition: none;
    }
  }
`);
