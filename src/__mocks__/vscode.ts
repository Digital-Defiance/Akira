/**
 * Mock implementation of VS Code API for testing
 */

export const workspace = {
  workspaceFolders: undefined as any,
  getConfiguration: (section?: string) => ({
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      if (key === "specDirectory") {
        return ".kiro/specs" as any;
      }
      return defaultValue;
    },
    has: (key: string) => false,
    inspect: (key: string) => undefined,
    update: async (key: string, value: any) => {},
  }),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path }),
  parse: (path: string) => ({ fsPath: path }),
};
