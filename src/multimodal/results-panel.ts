/**
 * Results Panel for Multimodal Input Support
 * Displays image analysis results in a webview panel
 * Requirements: REQ-2.2
 */

import * as vscode from "vscode";
import { AnalysisResult, DetectionLabel } from "./types";

/**
 * Manages the Image Analysis Results panel webview
 * Requirement: REQ-2.2
 */
export class ResultsPanel {
  public static currentPanel: ResultsPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _currentResult: AnalysisResult | undefined;

  /**
   * Create or show the results panel
   * @param result - Optional analysis result to display immediately
   */
  public static createOrShow(result?: AnalysisResult): ResultsPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    // If we already have a panel, show it and update content
    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel._panel.reveal(column);
      if (result) {
        ResultsPanel.currentPanel.updateResult(result);
      }
      return ResultsPanel.currentPanel;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      "imageAnalysisResults",
      "Image Analysis",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    ResultsPanel.currentPanel = new ResultsPanel(panel, result);
    return ResultsPanel.currentPanel;
  }

  /**
   * Revive a panel from a previous session
   */
  public static revive(panel: vscode.WebviewPanel): void {
    ResultsPanel.currentPanel = new ResultsPanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel, result?: AnalysisResult) {
    this._panel = panel;
    this._currentResult = result;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "copyJson":
            if (this._currentResult) {
              vscode.env.clipboard.writeText(
                JSON.stringify(this._currentResult, null, 2)
              );
              vscode.window.showInformationMessage(
                "Analysis result copied to clipboard"
              );
            }
            break;
          case "openImage":
            if (this._currentResult?.imagePath) {
              vscode.commands.executeCommand(
                "vscode.open",
                vscode.Uri.file(this._currentResult.imagePath)
              );
            }
            break;
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * Update the panel with a new analysis result
   * @param result - The analysis result to display
   */
  public updateResult(result: AnalysisResult): void {
    this._currentResult = result;
    this._update();
  }

  /**
   * Get the current result being displayed
   */
  public getCurrentResult(): AnalysisResult | undefined {
    return this._currentResult;
  }

  /**
   * Clear the panel content
   */
  public clear(): void {
    this._currentResult = undefined;
    this._update();
  }

  /**
   * Dispose of the panel and clean up resources
   */
  public dispose(): void {
    ResultsPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  /**
   * Serialize the analysis result to a JSON-serializable object
   * Requirement: REQ-2.2
   */
  public static serializeResult(result: AnalysisResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Deserialize a JSON string back to an AnalysisResult
   * Requirement: REQ-2.2
   */
  public static deserializeResult(json: string): AnalysisResult {
    return JSON.parse(json) as AnalysisResult;
  }

  private _getHtmlForWebview(): string {
    const result = this._currentResult;
    const resultJson = result ? ResultsPanel.serializeResult(result) : "null";

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Analysis Results</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            line-height: 1.5;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        .header {
            background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
            padding: 20px;
            color: white;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .header h1 {
            font-size: 1.5em;
            margin-bottom: 5px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .header .subtitle {
            font-size: 0.9em;
            opacity: 0.9;
        }

        .content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            text-align: center;
        }

        .empty-state .icon {
            font-size: 3em;
            margin-bottom: 15px;
            opacity: 0.5;
        }

        .section {
            margin-bottom: 25px;
        }

        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .section-header h2 {
            font-size: 1.1em;
            color: var(--vscode-foreground);
        }

        .metadata-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }

        .metadata-item {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 12px;
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }

        .metadata-item .label {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }

        .metadata-item .value {
            font-weight: 500;
            word-break: break-all;
        }

        .labels-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .label-item {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 12px;
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }

        .label-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .label-name {
            font-weight: 600;
            font-size: 1em;
        }

        .confidence-badge {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.85em;
        }

        .confidence-high {
            background: #28a745;
            color: white;
        }

        .confidence-medium {
            background: #ffc107;
            color: black;
        }

        .confidence-low {
            background: #dc3545;
            color: white;
        }

        .bounding-box {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family);
        }

        .ocr-section {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }

        .ocr-text {
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.95em;
            line-height: 1.6;
        }

        .json-section {
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            overflow: hidden;
        }

        .json-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .json-content {
            padding: 15px;
            overflow-x: auto;
            max-height: 400px;
            overflow-y: auto;
        }

        .json-content pre {
            margin: 0;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
            line-height: 1.4;
        }

        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
            transition: background 0.2s;
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .button-group {
            display: flex;
            gap: 8px;
        }

        .no-labels {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 20px;
            text-align: center;
        }

        .timestamp {
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🖼️ Image Analysis Results</h1>
            <div class="subtitle">${result ? `Analysis completed for ${this._getFileName(result.imagePath)}` : "No analysis results to display"}</div>
        </div>

        <div class="content">
            ${result ? this._renderResultContent(result, resultJson) : this._renderEmptyState()}
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function copyJson() {
            vscode.postMessage({ command: 'copyJson' });
        }

        function openImage() {
            vscode.postMessage({ command: 'openImage' });
        }
    </script>
</body>
</html>`;
  }

  private _renderEmptyState(): string {
    return `
      <div class="empty-state">
        <div class="icon">🖼️</div>
        <h2>No Analysis Results</h2>
        <p>Run an image analysis to see results here.</p>
      </div>
    `;
  }

  private _renderResultContent(result: AnalysisResult, resultJson: string): string {
    return `
      <!-- Metadata Section -->
      <div class="section">
        <div class="section-header">
          <h2>📊 Analysis Metadata</h2>
          <div class="button-group">
            <button onclick="openImage()">Open Image</button>
          </div>
        </div>
        <div class="metadata-grid">
          <div class="metadata-item">
            <div class="label">Image Path</div>
            <div class="value">${this._escapeHtml(result.imagePath)}</div>
          </div>
          <div class="metadata-item">
            <div class="label">Timestamp</div>
            <div class="value timestamp">${this._formatTimestamp(result.timestamp)}</div>
          </div>
          <div class="metadata-item">
            <div class="label">Model ID</div>
            <div class="value">${this._escapeHtml(result.modelId)}</div>
          </div>
          <div class="metadata-item">
            <div class="label">Inference Mode</div>
            <div class="value">${result.inferenceMode === "cloud" ? "☁️ Cloud" : "💻 Local"}</div>
          </div>
          <div class="metadata-item">
            <div class="label">Duration</div>
            <div class="value">${result.duration}ms</div>
          </div>
          <div class="metadata-item">
            <div class="label">Analysis ID</div>
            <div class="value">${this._escapeHtml(result.id)}</div>
          </div>
        </div>
      </div>

      <!-- Labels Section -->
      <div class="section">
        <div class="section-header">
          <h2>🏷️ Detection Labels (${result.labels.length})</h2>
        </div>
        ${this._renderLabels(result.labels)}
      </div>

      <!-- OCR Section -->
      ${result.ocrText ? this._renderOcrSection(result.ocrText) : ""}

      <!-- Raw JSON Section -->
      <div class="section">
        <div class="section-header">
          <h2>📄 Raw JSON</h2>
        </div>
        <div class="json-section">
          <div class="json-header">
            <span>JSON-serializable results object</span>
            <button onclick="copyJson()">Copy JSON</button>
          </div>
          <div class="json-content">
            <pre>${this._escapeHtml(resultJson)}</pre>
          </div>
        </div>
      </div>
    `;
  }

  private _renderLabels(labels: DetectionLabel[]): string {
    if (labels.length === 0) {
      return '<div class="no-labels">No labels detected</div>';
    }

    return `
      <div class="labels-list">
        ${labels.map((label) => this._renderLabelItem(label)).join("")}
      </div>
    `;
  }

  private _renderLabelItem(label: DetectionLabel): string {
    const confidencePercent = Math.round(label.confidence * 100);
    const confidenceClass = this._getConfidenceClass(label.confidence);

    return `
      <div class="label-item">
        <div class="label-header">
          <span class="label-name">${this._escapeHtml(label.label)}</span>
          <span class="confidence-badge ${confidenceClass}">${confidencePercent}%</span>
        </div>
        ${label.boundingBox ? this._renderBoundingBox(label.boundingBox) : ""}
      </div>
    `;
  }

  private _renderBoundingBox(box: { x: number; y: number; width: number; height: number }): string {
    return `
      <div class="bounding-box">
        📐 Bounding Box: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}
      </div>
    `;
  }

  private _renderOcrSection(ocrText: string): string {
    return `
      <div class="section">
        <div class="section-header">
          <h2>📝 OCR Text</h2>
        </div>
        <div class="ocr-section">
          <div class="ocr-text">${this._escapeHtml(ocrText)}</div>
        </div>
      </div>
    `;
  }

  private _getConfidenceClass(confidence: number): string {
    if (confidence >= 0.8) return "confidence-high";
    if (confidence >= 0.5) return "confidence-medium";
    return "confidence-low";
  }

  private _getFileName(path: string): string {
    return path.split(/[/\\]/).pop() || path;
  }

  private _formatTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  }

  private _escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
