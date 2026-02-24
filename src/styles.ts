const styleElement = document.createElement("style");
document.head.appendChild(styleElement);

const addStyles = (styles: string) => {
  styleElement.textContent += styles;
};

addStyles(`
  :root {
    /* 색상 팔레트 (대비 4.5:1 이상 유지) */
    --bg-primary: #FAFAFA;
    --bg-secondary: #FFFFFF;
    --bg-accent: #F3F4F6;
    --text-primary: #0F172A;
    --text-secondary: #475569;
    --text-muted: #64748B;
    --brand-primary: #2563EB;
    --brand-secondary: #3B82F6;
    --success: #059669;
    --warning: #D97706;
    --error: #DC2626;
    /* 타이포그래피 */
    --font-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --text-xs: 10px;
    --text-sm: 11px;
    --text-base: 13px;
    --text-lg: 14px;
    /* 스페이싱 & 반응형 */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 12px;
    --space-lg: 16px;
    --space-xl: 24px;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    /* z-index scale */
    --z-base: 0;
    --z-dropdown: 10;
    --z-toast: 50;
    /* 터치 타겟 최소 44px */
    --touch-min: 44px;
    --transition-fast: 150ms;
    --transition-base: 200ms;
    --transition-slow: 300ms;
  }

  @media (prefers-reduced-motion: reduce) {
    :root {
      --transition-fast: 0ms;
      --transition-base: 0ms;
      --transition-slow: 0ms;
    }
  }

  html, body {
    overflow-y: auto;
    scrollbar-width: thin;
    -ms-overflow-style: none;
  }
  html::-webkit-scrollbar, body::-webkit-scrollbar {
    width: 6px;
  }
  html::-webkit-scrollbar-thumb {
    background: var(--text-muted);
    border-radius: 3px;
  }

  body {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-primary);
    font-size: var(--text-base);
    line-height: 1.5;
    margin: 0;
  }

  /* 헤더 */
  .panel-header {
    padding: var(--space-lg) var(--space-lg) var(--space-md);
    text-align: center;
    border-bottom: 1px solid var(--bg-accent);
  }
  .panel-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .panel-subtitle {
    margin: var(--space-xs) 0 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .panel-main {
    padding: 0;
  }

  /* 로딩 섹션 */
  #loadingContainerWrapper.loading-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
    background: var(--bg-primary);
    border-radius: var(--radius-md);
  }
  .model-status-text {
    margin: 0 0 var(--space-sm);
    font-size: var(--text-lg);
    color: var(--text-secondary);
  }
  #loadingContainer.loading-bar-container {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--bg-accent);
  }

  #inputContainer.input-section {
    padding: var(--space-lg);
    display: flex;
    justify-content: center;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    margin: var(--space-md) var(--space-lg);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  #extract-button.btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    min-height: var(--touch-min);
    min-width: 160px;
    padding: var(--space-sm) var(--space-xl);
    background-color: var(--brand-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-lg);
    font-weight: 600;
    font-family: var(--font-primary);
    transition: background-color var(--transition-base) ease, box-shadow var(--transition-base) ease;
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.2);
  }
  #extract-button.btn-primary:hover:not(:disabled) {
    background-color: var(--brand-secondary);
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  }
  #extract-button.btn-primary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.4);
  }
  #extract-button.btn-primary:disabled {
    background-color: var(--text-muted);
    cursor: not-allowed;
    box-shadow: none;
  }

  #stage.stage-section {
    display: flex;
    justify-content: center;
    padding: var(--space-md);
  }

  #loading-indicator.loading-dots {
    display: none;
    position: relative;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: var(--brand-primary);
    animation: dot-flashing 1s infinite linear alternate;
    animation-delay: 0.5s;
  }
  #loading-indicator.loading-dots::before,
  #loading-indicator.loading-dots::after {
    content: '';
    position: absolute;
    top: 0;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: var(--brand-primary);
  }
  #loading-indicator.loading-dots::before {
    left: -15px;
    animation: dot-flashing 1s infinite alternate;
    animation-delay: 0s;
  }
  #loading-indicator.loading-dots::after {
    left: 15px;
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
    padding: var(--space-lg);
  }

  .history-card {
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    border: 1px solid var(--bg-accent);
    font-family: var(--font-primary);
    transition: box-shadow var(--transition-base) ease, border-color var(--transition-base) ease;
  }
  .history-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .section-container {
    position: relative;
    margin-bottom: var(--space-lg);
  }

  .summary-text {
    overflow: hidden;
    transition: max-height var(--transition-slow) ease-out;
    line-height: 1.6;
    transform: translateZ(0);
    color: var(--text-primary);
    font-size: var(--text-base);
  }

  .content-text {
    position: relative;
    line-height: 1.6;
    color: var(--text-secondary);
    font-size: var(--text-base);
  }

  .content-title {
    position: relative;
    font-weight: 700;
    font-size: var(--text-lg);
    margin-bottom: var(--space-sm);
    color: var(--text-primary);
    padding-bottom: 28px;
  }

  .content-body {
    color: var(--text-secondary);
    line-height: 1.6;
    margin-top: var(--space-sm);
    white-space: pre-wrap;
    font-size: var(--text-base);
  }

  .content-text.expanded {
    max-height: none;
  }

  .toggle-button {
    position: absolute;
    bottom: 0;
    right: 0;
    min-height: var(--touch-min);
    min-width: 56px;
    padding: var(--space-xs) var(--space-md);
    background: none;
    border: none;
    color: var(--brand-primary);
    cursor: pointer;
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
    box-shadow: 0 0 0 2px var(--brand-primary);
  }

  .meta-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .history-timestamp {
    font-size: var(--text-xs);
    color: var(--text-muted);
    align-self: center;
  }

  .meta-actions {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--text-sm);
    font-weight: 600;
    border-radius: var(--radius-lg);
    padding: var(--space-xs) var(--space-md);
    margin-right: var(--space-sm);
    margin-bottom: 2px;
  }
  .badge-pending {
    background: var(--bg-accent);
    color: var(--text-muted);
  }
  .badge-inprogress {
    background: #FEF3C7;
    color: var(--warning);
  }
  .badge-done {
    background: #D1FAE5;
    color: var(--success);
  }
  .badge-error {
    background: #FEE2E2;
    color: var(--error);
  }

  .copy-button,
  .retry-button,
  .start-summary-button,
  .delete-button {
    font-size: var(--text-base);
    border: none;
    background: transparent;
    cursor: pointer;
    min-width: var(--touch-min);
    min-height: var(--touch-min);
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast) ease, background-color var(--transition-fast) ease;
  }
  .copy-button:hover:not(:disabled),
  .retry-button:hover:not(:disabled),
  .delete-button:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-accent);
  }
  .copy-button:focus-visible,
  .retry-button:focus-visible,
  .delete-button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--brand-primary);
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

  .summary-text,
  .content-body,
  .content-text {
    font-size: var(--text-base);
  }

  .history-card.status-in-progress {
    border-left: 4px solid var(--warning);
    background: #FFFBEB;
  }
  .history-card.status-error {
    border-left: 4px solid var(--error);
    background: #FEF2F2;
  }
  .history-card.status-done {
    border-left: 4px solid var(--success);
    background: #ECFDF5;
  }
  .history-card.status-pending {
    border-left: 4px solid var(--text-muted);
    background: var(--bg-accent);
  }

  .content-title a {
    color: var(--brand-primary);
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
    box-shadow: 0 0 0 2px var(--brand-primary);
  }

  @media (max-width: 400px) {
    .history-card {
      min-width: 250px;
    }
  }

  /* Toast (z-index: var(--z-toast)) */
  #toast-container.toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    min-width: 200px;
    max-width: 80vw;
    padding: 12px 24px;
    border-radius: var(--radius-md);
    color: #fff;
    font-size: 0.875rem;
    line-height: 1.4;
    text-align: center;
    z-index: var(--z-toast);
    opacity: 0.98;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    display: none;
    transition: opacity var(--transition-base) ease;
  }
  #toast-container.toast:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  #toast-container.toast-info {
    background: #374151;
  }
  #toast-container.toast-success {
    background: var(--success);
  }
  #toast-container.toast-error {
    background: var(--error);
  }
  @media (prefers-reduced-motion: reduce) {
    #toast-container.toast {
      transition: none;
    }
  }
`);
