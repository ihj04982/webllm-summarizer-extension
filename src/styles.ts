// Create a style element
const styleElement = document.createElement("style");
document.head.appendChild(styleElement);

// Function to add styles
const addStyles = (styles: string) => {
  styleElement.textContent += styles;
};

// Add all styles
addStyles(`
  :root {
    /* 색상 팔레트 */
    --bg-primary: #FAFAFA;
    --bg-secondary: #FFFFFF;
    --bg-accent: #F3F4F6;
    --text-primary: #1F2937;
    --text-secondary: #6B7280;
    --text-muted: #9CA3AF;
    --brand-primary: #2563EB;
    --brand-secondary: #3B82F6;
    --success: #10B981;
    --warning: #F59E0B;
    --error: #EF4444;
    /* 타이포그래피 */
    --font-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI';
    --text-xs: 9px;
    --text-sm: 10px;
    --text-base: 11px;
    --text-lg: 12px;
    /* 스페이싱 & 반응형 */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 12px;
    --space-lg: 16px;
    --space-xl: 24px;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
  }

  body {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-primary);
    font-size: var(--text-base);
    margin: 0;
  }

  #loadingContainerWrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg);
    background: var(--bg-primary);
    border-radius: var(--radius-md);
  }

  #loadingText, #model-status-text {
    margin-bottom: var(--space-sm);
    font-size: var(--text-lg);
    color: var(--text-secondary);
  }

  #loadingContainer {
    width: 100%;
    height: 4px;
  }

  #inputContainer {
    padding: var(--space-lg);
    display: flex;
    justify-content: center;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
  }

  #extract-button {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background-color: var(--brand-primary);
    color: var(--bg-secondary);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-lg);
    font-family: var(--font-primary);
    transition: background-color 0.2s;
    box-shadow: 0 1px 2px rgba(37, 99, 235, 0.08);
  }
  #extract-button:hover {
    background-color: var(--brand-secondary);
  }
  #extract-button:disabled {
    background-color: var(--text-muted);
    cursor: not-allowed;
  }

  #stage {
    display: flex;
    justify-content: center;
    padding: var(--space-md);
  }

  #loading-indicator {
    display: none;
    position: relative;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: var(--brand-primary);
    color: var(--brand-primary);
    animation: dot-flashing 1s infinite linear alternate;
    animation-delay: 0.5s;
  }
  #loading-indicator::before,
  #loading-indicator::after {
    content: '';
    display: inline-block;
    position: absolute;
    top: 0;
  }
  #loading-indicator::before {
    left: -15px;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: var(--brand-primary);
    color: var(--brand-primary);
    animation: dot-flashing 1s infinite alternate;
    animation-delay: 0s;
  }
  #loading-indicator::after {
    left: 15px;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: var(--brand-primary);
    color: var(--brand-primary);
    animation: dot-flashing 1s infinite alternate;
    animation-delay: 1s;
  }
  @keyframes dot-flashing {
    0% { background-color: var(--brand-primary); }
    50%, 100% { background-color: rgba(37, 99, 235, 0.2); }
  }

  #historyWrapper {
    padding: var(--space-lg);
  }

  .history-card {
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
    font-family: var(--font-primary);
  }

  .section-container {
    position: relative;
    margin-bottom: var(--space-lg);
  }

  .summary-text {
    overflow: hidden;
    transition: max-height 0.3s ease-out;
    line-height: 1.5;
    will-change: max-height;
    transform: translateZ(0);
    color: var(--text-primary);
    font-size: var(--text-base);
  }

  .content-text {
    position: relative;
    line-height: 1.5;
    color: var(--text-secondary);
    font-size: var(--text-base);
  }

  .content-title {
    position: relative;
    font-weight: bold;
    font-size: var(--text-lg);
    margin-bottom: var(--space-sm);
    color: var(--text-primary);
    padding-bottom: 24px;
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
    background: none;
    border: none;
    color: var(--brand-primary);
    cursor: pointer;
    font-size: var(--text-sm);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    transition: color 0.2s, background 0.2s;
  }
  .toggle-button:hover {
    color: var(--brand-secondary);
    background: var(--bg-accent);
  }

  .meta-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }

  .history-timestamp {
    font-size: var(--text-xs);
    color: var(--text-muted);
    align-self: center;
  }

  .meta-actions {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
    align-self: flex-end;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--text-sm);
    font-weight: 600;
    border-radius: var(--radius-lg);
    padding: var(--space-xs) var(--space-md) var(--space-xs) var(--space-sm);
    margin-right: var(--space-sm);
    margin-bottom: 2px;
  }
  .badge-pending {
    background: var(--bg-accent);
    color: var(--text-muted);
  }
  .badge-inprogress {
    background: #fff3cd;
    color: var(--warning);
  }
  .badge-done {
    background: #e6f4ea;
    color: var(--success);
  }
  .badge-error {
    background: #fdecea;
    color: var(--error);
  }

  .copy-button,
  .retry-button,
  .start-summary-button,
  .delete-button {
    font-size: var(--text-base);
    border: none;
    background: none;
    cursor: pointer;
    padding: var(--space-xs) var(--space-md);
    min-width: 32px;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .status-badge,
  .history-timestamp,
  .meta-actions {
    font-size: var(--text-sm);
  }

  .content-title {
    font-size: var(--text-lg);
  }

  .summary-text,
  .content-body,
  .content-text {
    font-size: var(--text-base);
  }

  .history-card.status-in-progress {
    border-left: 4px solid var(--warning);
    background: #fffbe7;
  }
  .history-card.status-error {
    border-left: 4px solid var(--error);
    background: #fff5f5;
  }
  .history-card.status-done {
    border-left: 4px solid var(--success);
    background: #f6fff8;
  }
  .history-card.status-pending {
    border-left: 4px solid var(--text-muted);
    background: var(--bg-accent);
  }

  @media (max-width: 400px) {
    .history-card {
      min-width: 320px;
    }
  }
`);
