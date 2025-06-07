// Create a style element
const styleElement = document.createElement("style");
document.head.appendChild(styleElement);

// Function to add styles
const addStyles = (styles: string) => {
  styleElement.textContent += styles;
};

// Add all styles
addStyles(`
  #loadingContainerWrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  #loadingText {
    margin-bottom: 10px;
    font-size: 1.1em;
    color: #666666;
  }

  #loadingContainer {
    width: 100%;
    height: 4px;
  }

  #inputContainer {
    padding: 16px;
    display: flex;
    justify-content: center;
  }

  #extract-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background-color: #4a90e2;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1em;
    transition: background-color 0.2s;
  }

  #extract-button:hover {
    background-color: #357abd;
  }

  #extract-button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }

  #stage {
    display: flex;
    justify-content: center;
    padding: 10px;
  }

  #loading-indicator {
    display: none;
    position: relative;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: #4a90e2;
    color: #4a90e2;
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
    background-color: #4a90e2;
    color: #4a90e2;
    animation: dot-flashing 1s infinite alternate;
    animation-delay: 0s;
  }

  #loading-indicator::after {
    left: 15px;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background-color: #4a90e2;
    color: #4a90e2;
    animation: dot-flashing 1s infinite alternate;
    animation-delay: 1s;
  }

  @keyframes dot-flashing {
    0% {
      background-color: #4a90e2;
    }
    50%,
    100% {
      background-color: rgba(74, 144, 226, 0.2);
    }
  }

  #historyWrapper {
    padding: 16px;
  }

  .history-card {
    background: #fff;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .section-container {
    position: relative;
    margin-bottom: 16px;
  }

  .summary-text {
    overflow: hidden;
    transition: max-height 0.3s ease-out;
    line-height: 1.5;
  }

  .content-text {
    position: relative;
    line-height: 1.5;
    color: #666666;
  }

  .content-title {
    position: relative;
    font-weight: bold;
    font-size: 1.1em;
    margin-bottom: 8px;
    color: #333;
    padding-bottom: 24px;
  }

  .content-body {
    color: #666;
    line-height: 1.6;
    margin-top: 8px;
    white-space: pre-wrap;
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
    color: #357abd;
    cursor: pointer;
    font-size: 0.9em;
    padding: 4px 8px;
  }

  .toggle-button:hover {
    color: #4a90e2;
  }

  .meta-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    font-size: 0.9em;
    color: #666666;
  }

  .copy-button {
    background: none;
    border: none;
    cursor: pointer;
    color: #666666;
    padding: 4px;
  }

  .copy-button:hover {
    color: #333;
  }
`);
