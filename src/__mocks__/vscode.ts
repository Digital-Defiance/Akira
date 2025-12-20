/**
 * Mock VS Code API for unit tests
 */

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  get event() {
    return (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          const index = this.listeners.indexOf(listener);
          if (index > -1) {
            this.listeners.splice(index, 1);
          }
        },
      };
    };
  }

  fire(data: T): void {
    this.listeners.forEach((listener) => listener(data));
  }

  dispose(): void {
    this.listeners = [];
  }
}

export const window = {
  createOutputChannel: () => ({
    append: () => {},
    appendLine: () => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
  createStatusBarItem: () => ({
    text: "",
    tooltip: "",
    command: "",
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
  showInformationMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showInputBox: () => Promise.resolve(undefined),
  showTextDocument: () => Promise.resolve(undefined),
  activeTextEditor: undefined,
  createTreeView: () => ({
    dispose: () => {},
  }),
};

export const workspace = {
  workspaceFolders: undefined,
  getConfiguration: () => ({
    get: (_key: string, defaultValue?: any) => defaultValue,
    has: () => false,
    inspect: () => undefined,
    update: () => Promise.resolve(),
  }),
  onDidChangeConfiguration: () => ({
    dispose: () => {},
  }),
  openTextDocument: () => Promise.resolve(undefined),
};

export const commands = {
  registerCommand: () => ({
    dispose: () => {},
  }),
  executeCommand: () => Promise.resolve(undefined),
  getCommands: () => Promise.resolve([]),
};

export const extensions = {
  getExtension: () => undefined,
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, path }),
  parse: (uri: string) => ({ fsPath: uri, path: uri }),
};

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export class TreeItem {
  constructor(public label: string, public collapsibleState?: number) {}
}

export class ThemeIcon {
  constructor(public id: string, public color?: any) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}

export const chat = {
  createChatParticipant: () => ({
    dispose: () => {},
  }),
};
