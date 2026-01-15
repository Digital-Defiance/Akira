import * as vscode from "vscode";

/**
 * Manages the Welcome panel for the Akira extension
 */
export class WelcomePanel {
  public static currentPanel: WelcomePanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow() {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    // If we already have a panel, show it.
    if (WelcomePanel.currentPanel) {
      WelcomePanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      "akiraWelcome",
      "Welcome to Akira",
      column,
      {
        enableScripts: true,
      }
    );

    WelcomePanel.currentPanel = new WelcomePanel(panel);
  }

  public static revive(
    panel: vscode.WebviewPanel
  ) {
    WelcomePanel.currentPanel = new WelcomePanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "openCommand":
            vscode.commands.executeCommand(message.commandId);
            break;
          case "openDocumentation":
            vscode.env.openExternal(
              vscode.Uri.parse(message.url)
            );
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    WelcomePanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Akira</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            overflow: hidden;
        }

        .container {
            display: flex;
            height: 100vh;
            flex-direction: column;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            text-align: center;
            color: white;
            border-bottom: 2px solid var(--vscode-focusBorder);
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 700;
        }

        .header p {
            font-size: 1.1em;
            opacity: 0.95;
        }

        .content {
            flex: 1;
            overflow-y: auto;
            padding: 30px;
        }

        .section {
            margin-bottom: 40px;
        }

        .section h2 {
            font-size: 1.5em;
            margin-bottom: 15px;
            color: var(--vscode-editor-foreground);
            border-bottom: 2px solid var(--vscode-focusBorder);
            padding-bottom: 10px;
        }

        .section p {
            margin-bottom: 10px;
            color: var(--vscode-editor-foreground);
        }

        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }

        .feature-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-focusBorder);
            border-radius: 8px;
            padding: 20px;
            transition: all 0.3s ease;
        }

        .feature-card:hover {
            border-color: #667eea;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }

        .feature-card h3 {
            font-size: 1.1em;
            margin-bottom: 10px;
            color: #667eea;
        }

        .feature-card p {
            font-size: 0.95em;
            line-height: 1.5;
        }

        .button-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 20px;
        }

        button {
            background-color: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1em;
            transition: all 0.3s ease;
            white-space: nowrap;
        }

        button:hover {
            background-color: #764ba2;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .code-block {
            background-color: var(--vscode-textCodeBlock-background);
            border-left: 3px solid #667eea;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            overflow-x: auto;
        }

        .workflow {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-focusBorder);
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            flex-wrap: wrap;
            gap: 15px;
        }

        .workflow-step {
            text-align: center;
            flex: 1;
            min-width: 120px;
        }

        .workflow-step .icon {
            font-size: 2em;
            margin-bottom: 10px;
        }

        .workflow-step p {
            font-weight: 500;
            font-size: 0.95em;
        }

        .arrow {
            color: #667eea;
            font-weight: bold;
            display: none;
        }

        @media (min-width: 768px) {
            .arrow {
                display: block;
            }
        }

        .quick-start {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-focusBorder);
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }

        .quick-start ol {
            margin-left: 20px;
        }

        .quick-start li {
            margin-bottom: 10px;
        }

        .footer {
            padding: 20px;
            text-align: center;
            border-top: 1px solid var(--vscode-focusBorder);
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }

        .links {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 10px;
            flex-wrap: wrap;
        }

        a {
            color: #667eea;
            text-decoration: none;
            cursor: pointer;
        }

        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Welcome to Akira</h1>
            <p>Spec-driven development powered by GitHub Copilot Chat</p>
        </div>

        <div class="content">
            <!-- What is Akira Section -->
            <div class="section">
                <h2>What is Akira?</h2>
                <p>Akira is a VS Code extension that transforms your development workflow using spec-driven development. It guides you through a structured workflow combining AI-powered generation with advanced requirements engineering practices.</p>
                <p>With Akira, you can:</p>
                <div class="features">
                    <div class="feature-card">
                        <h3>📋 Requirements</h3>
                        <p>Generate high-quality requirements following the EARS pattern and INCOSE quality standards</p>
                    </div>
                    <div class="feature-card">
                        <h3>🏗️ Design</h3>
                        <p>Create comprehensive technical designs with correctness properties for property-based testing</p>
                    </div>
                    <div class="feature-card">
                        <h3>✅ Tasks</h3>
                        <p>Generate executable implementation plans with proper task hierarchy and dependencies</p>
                    </div>
                    <div class="feature-card">
                        <h3>⚡ Execution</h3>
                        <p>Execute tasks with full context and automatic retry with adaptive reflection</p>
                    </div>
                    <div class="feature-card">
                        <h3>🤖 Copilot Integration</h3>
                        <p>Use the @spec participant in GitHub Copilot Chat for all spec operations</p>
                    </div>
                    <div class="feature-card">
                        <h3>🧪 Property Testing</h3>
                        <p>Validate correctness through property-based testing integrated into your workflow</p>
                    </div>
                </div>
            </div>

            <!-- Workflow Section -->
            <div class="section">
                <h2>The Akira Workflow</h2>
                <div class="workflow">
                    <div class="workflow-step">
                        <div class="icon">📝</div>
                        <p>Requirements</p>
                    </div>
                    <div class="arrow">→</div>
                    <div class="workflow-step">
                        <div class="icon">🏗️</div>
                        <p>Design</p>
                    </div>
                    <div class="arrow">→</div>
                    <div class="workflow-step">
                        <div class="icon">✅</div>
                        <p>Tasks</p>
                    </div>
                    <div class="arrow">→</div>
                    <div class="workflow-step">
                        <div class="icon">⚡</div>
                        <p>Execution</p>
                    </div>
                </div>
            </div>

            <!-- Quick Start Section -->
            <div class="section">
                <h2>Quick Start</h2>
                <div class="quick-start">
                    <ol>
                        <li><strong>Open Copilot Chat:</strong> Press <code>Ctrl+Shift+I</code> (or <code>Cmd+Shift+I</code> on Mac)</li>
                        <li><strong>Use @spec participant:</strong> Type <code>@spec</code> to start working with Akira</li>
                        <li><strong>Create a spec:</strong> Use <code>@spec /create</code> to generate a new specification</li>
                        <li><strong>Follow the workflow:</strong> Work through requirements, design, tasks, and execution phases</li>
                        <li><strong>View progress:</strong> Check the Spec Tree in the left sidebar to track your progress</li>
                    </ol>
                </div>
            </div>

            <!-- Commands Section -->
            <div class="section">
                <h2>Available Commands</h2>
                <div class="button-group">
                    <button onclick="sendCommand('akira.createSpec')">Create New Spec</button>
                    <button class="secondary" onclick="sendCommand('akira.refreshSpecs')">Refresh Specs</button>
                    <button class="secondary" onclick="openLink('https://github.com/digital-defiance/akira#readme')">View Documentation</button>
                    <button class="secondary" onclick="openLink('https://github.com/digital-defiance/akira/issues')">Report Issue</button>
                </div>
            </div>

            <!-- Community Section -->
            <div class="section">
                <h2>🤝 Open Source & Community</h2>
                <div class="feature-card">
                    <h3>Akira is Open Source</h3>
                    <p><strong>ACS Akira is incomplete and actively under development.</strong> We're building this tool in the open and welcome contributions from the community!</p>
                </div>
                <div class="feature-card" style="margin-top: 15px;">
                    <h3>We Need Contributors</h3>
                    <p>Whether you're a developer, designer, technical writer, or have ideas for improvements, Digital Defiance welcomes your contributions. Check out our GitHub repository to see how you can help!</p>
                </div>
                <div class="button-group" style="margin-top: 15px;">
                    <button class="secondary" onclick="openLink('https://github.com/digital-defiance/akira')">View on GitHub</button>
                    <button class="secondary" onclick="openLink('https://github.com/digital-defiance/akira/contribute')">Contributor Guide</button>
                </div>
            </div>

            <!-- Key Concepts Section -->
            <div class="section">
                <h2>Key Concepts</h2>
                <div class="feature-card">
                    <h3>📚 EARS Patterns</h3>
                    <p>Requirements are structured using the Easy Approach to Requirements Syntax (EARS). Supported patterns include ubiquitous, event-driven, state-driven, unwanted-event, optional, and complex.</p>
                </div>
                <div class="feature-card" style="margin-top: 15px;">
                    <h3>✓ INCOSE Quality Rules</h3>
                    <p>Automatically validate requirements against INCOSE semantic quality standards to ensure consistency and completeness.</p>
                </div>
                <div class="feature-card" style="margin-top: 15px;">
                    <h3>🔄 Model Context Protocol</h3>
                    <p>Akira uses MCP for persistent context across your entire development workflow, keeping Copilot Chat informed and coherent.</p>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>🎉 Ready to get started?</p>
            <p>Use <code>@spec /help</code> in Copilot Chat to see all available commands.</p>
            <p style="margin-top: 15px; font-size: 0.9em; opacity: 0.8;"><strong>💡 Note:</strong> ACS Akira is open source, incomplete, and actively seeking contributors. Digital Defiance welcomes your involvement!</p>
            <div class="links">
                <a onclick="openLink('https://github.com/digital-defiance/akira')">GitHub Repository</a>
                <a onclick="openLink('https://github.com/digital-defiance/akira/wiki')">Wiki</a>
                <a onclick="openLink('https://github.com/digital-defiance/akira/issues')">Report a Bug</a>
                <a onclick="openLink('https://github.com/digital-defiance/akira/discussions')">Discussions</a>
            </div>
            <p style="margin-top: 10px; opacity: 0.7;">Akira v0.1.8 | Part of the AI Capabilities Suite by Digital Defiance</p>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function sendCommand(commandId) {
            vscode.postMessage({
                command: 'openCommand',
                commandId: commandId
            });
        }

        function openLink(url) {
            vscode.postMessage({
                command: 'openDocumentation',
                url: url
            });
        }
    </script>
</body>
</html>`;
  }
}
