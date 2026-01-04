# AI Capabilities Suite Integration

This document describes how Akira integrates with the `@ai-capabilities-suite` packages.

## Integrated Packages

### 1. @ai-capabilities-suite/mcp-client-base (v1.0.0)

**Purpose:** Provides a robust base class for MCP client implementations with timeout handling, re-synchronization, and connection state management.

**Integration:**
- `src/mcp-client.ts` - `SpecMCPClient` extends `BaseMCPClient`
- Provides automatic timeout handling for all MCP requests
- Handles connection failures with automatic retry logic
- Manages server process lifecycle
- Comprehensive logging and diagnostics

**Key Features Used:**
- Timeout management (30s for standard requests, 60s for initialization)
- Automatic re-synchronization with exponential backoff
- Connection state tracking
- Communication logging for debugging
- Server process health monitoring

**Configuration:**
```typescript
{
  timeout: {
    initializationTimeoutMs: 60000,
    standardRequestTimeoutMs: 30000,
    toolsListTimeoutMs: 60000,
  },
  reSync: {
    maxRetries: 3,
    retryDelayMs: 2000,
    backoffMultiplier: 1.5,
  },
  logging: {
    logLevel: "info",
    logCommunication: true,
  },
}
```

### 2. @ai-capabilities-suite/vscode-shared-status-bar (v1.0.21)

**Purpose:** Provides a singleton status bar that can be shared across multiple MCP extensions, preventing duplicate status bar items.

**Integration:**
- `src/status-bar-manager.ts` - Uses `registerExtension()` and `unregisterExtension()`
- `src/extension.ts` - Initializes with `setOutputChannel()`
- Registers as "akira-spec-extension"

**Key Features Used:**
- Singleton pattern - only one status bar item across all extensions
- Extension metadata with display name and status
- Action buttons in status bar menu
- Automatic cleanup on extension deactivation
- Comprehensive logging

**Status Bar States:**
- **OK** - Normal operation, showing current spec and phase
- **Warning** - Progress indicator (e.g., "Creating spec...")
- **Error** - Error state with error message

**Actions Provided:**
- Open Spec - Opens the current spec document
- Create Spec - Creates a new spec
- Refresh - Refreshes the spec list

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VS Code Extension                        │
│                      (extension.ts)                          │
└───────────────┬─────────────────────────────────────────────┘
                │
                ├─────────────────────────────────────────────┐
                │                                             │
                ▼                                             ▼
┌───────────────────────────┐               ┌─────────────────────────────┐
│     SpecMCPClient         │               │   StatusBarManager          │
│  (mcp-client.ts)          │               │  (status-bar-manager.ts)    │
│                           │               │                             │
│  extends BaseMCPClient    │               │  uses registerExtension()   │
│  from @ai-capabilities-   │               │  from @ai-capabilities-     │
│  suite/mcp-client-base    │               │  suite/vscode-shared-       │
│                           │               │  status-bar                 │
└───────────┬───────────────┘               └─────────────────────────────┘
            │
            │ spawns
            ▼
┌───────────────────────────┐
│  MCP Server Process       │
│  (mcp-server-standalone)  │
│                           │
│  Runs as child process    │
│  Handles spec operations  │
└───────────────────────────┘
```

## Benefits

### From mcp-client-base:

1. **Reliability** - Automatic retry logic handles transient failures
2. **Observability** - Comprehensive logging and diagnostics
3. **Consistency** - Standardized timeout and error handling
4. **Maintainability** - Shared code reduces duplication
5. **Robustness** - Battle-tested connection management

### From vscode-shared-status-bar:

1. **User Experience** - Single status bar item instead of multiple
2. **Resource Efficiency** - Singleton pattern reduces overhead
3. **Consistency** - Unified status bar across all MCP extensions
4. **Extensibility** - Easy to add actions and metadata
5. **Debugging** - Built-in diagnostics command

## Usage Examples

### Creating a Spec via MCP Client

```typescript
const outputChannel = vscode.window.createOutputChannel("Akira", { log: true });
const client = new SpecMCPClient(outputChannel);

await client.start();

const result = await client.createSpec("my-feature", "A new feature");
console.log(result);

client.stop();
```

### Updating Status Bar

```typescript
const statusBar = new StatusBarManager();

// Show normal status
await statusBar.updateStatus("my-feature", "requirements", 50);

// Show progress
await statusBar.showProgress("Creating spec...");

// Show error
await statusBar.showError("Failed to create spec");

// Cleanup
await statusBar.dispose();
```

## Testing

Both pl.io/)
extprotococonttps://modelon](httipecificaol St Protocel Contex [Modtus-bar)
-sta-shared-nce/vscodetal-DefiaDigihub.com/ttps://git](htoryposiBar Rered Status [VS Code Sha
- se)client-baefiance/mcp-al-DitDighub.com/ps://gittory](httosient Base RepCP Cli[M

- Referencesn

## n integratioifications
   - Not custom ico forSupport
   - tionsoperanning rus for long-ss bargrerod pr**
   - Ad **Status Ba
2.tion
ics collec  - Add metrn
 atioitizriornt request peme  - Implonses
 ng respmirt for strea Add suppo   -**
lientP C
1. **MC
tsancemen Enh

## Futured palette.m the commancommand froics` st-acs.diagno`mcphe un t);
```

Re.log(info
consolInfo();Diagnostic = getonst infor";
c-batatusred-sscode-shae/vilities-suit@ai-capab} from "cInfo agnostitDiport { geipt
im
```typescriagnostics: d
Checkr Issues
Baatus 
### St channel.
" output "Akirahe in togsew l;
```

Vignostics)log(diae.onsolcs();
costiagnnt.getDis = clieagnosticconst diescript
ics:
```typnostCheck diagues

nt IssMCP Clieing

### otshoubleTrotests

## ng Error handli
4.  testsstrationr regiStatus bas
3. estnnection tent coli cests
2. MCPn ttivatioxtension acrough:
1. Eerified th is vntegratione i
Thner)
runest de t+ VS Coests (mocha  t
- E2Es (vitest)estn tntegratio)
- Ists (vitest te- Unitin:
d are testeackages 