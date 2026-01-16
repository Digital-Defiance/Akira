/**
 * Prompt Runner
 * Executes prompts via child process or worker thread
 * 
 * Requirements:
 * - REQ-3.2: Execute in background without blocking UI thread
 * - Support cancellation via AbortSignal
 * - Return {exitCode, stdout, stderr, duration}
 */

import { spawn, ChildProcess } from "child_process";
import { PromptOptions, PromptResult } from "./types";

/** Default timeout for prompt execution (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Interface for prompt runner implementations
 * Allows for different execution strategies (child process, worker, mock)
 */
export interface IPromptRunner {
  runPrompt(prompt: string, opts?: PromptOptions): Promise<PromptResult>;
}

/**
 * Default prompt runner using child process
 * Spawns a shell to execute commands
 */
export class PromptRunner implements IPromptRunner {
  private shell: string;
  private shellArgs: string[];

  constructor() {
    // Use appropriate shell for the platform
    if (process.platform === "win32") {
      this.shell = "cmd.exe";
      this.shellArgs = ["/c"];
    } else {
      this.shell = "/bin/sh";
      this.shellArgs = ["-c"];
    }
  }

  /**
   * Run a prompt/command
   * @param prompt The command or prompt to execute
   * @param opts Execution options including timeout and abort signal
   * @returns Promise resolving to execution result
   */
  async runPrompt(prompt: string, opts?: PromptOptions): Promise<PromptResult> {
    const startTime = Date.now();
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT_MS;

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let canceled = false;
      let childProcess: ChildProcess | null = null;
      let timeoutId: NodeJS.Timeout | null = null;


      // Handle abort signal
      const abortHandler = () => {
        canceled = true;
        if (childProcess && !childProcess.killed) {
          childProcess.kill("SIGTERM");
          // Force kill after 1 second if still running
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              childProcess.kill("SIGKILL");
            }
          }, 1000);
        }
      };

      if (opts?.signal) {
        if (opts.signal.aborted) {
          // Already aborted
          resolve({
            exitCode: -1,
            stdout: "",
            stderr: "",
            duration: 0,
            canceled: true,
          });
          return;
        }
        opts.signal.addEventListener("abort", abortHandler, { once: true });
      }

      // Spawn child process
      try {
        childProcess = spawn(this.shell, [...this.shellArgs, prompt], {
          env: { ...process.env, ...opts?.env },
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        resolve({
          exitCode: -1,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          duration,
        });
        return;
      }

      // Set timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          if (childProcess && !childProcess.killed) {
            childProcess.kill("SIGTERM");
            setTimeout(() => {
              if (childProcess && !childProcess.killed) {
                childProcess.kill("SIGKILL");
              }
            }, 1000);
          }
        }, timeout);
      }

      // Collect stdout
      childProcess.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      // Collect stderr
      childProcess.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });


      // Handle process exit
      childProcess.on("close", (code) => {
        const duration = Date.now() - startTime;

        // Cleanup
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (opts?.signal) {
          opts.signal.removeEventListener("abort", abortHandler);
        }

        resolve({
          exitCode: code ?? -1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          duration,
          timedOut,
          canceled,
        });
      });

      // Handle process error
      childProcess.on("error", (error) => {
        const duration = Date.now() - startTime;

        // Cleanup
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (opts?.signal) {
          opts.signal.removeEventListener("abort", abortHandler);
        }

        resolve({
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: error.message,
          duration,
        });
      });
    });
  }
}

/**
 * Mock prompt runner for testing
 * Returns configurable results without spawning processes
 */
export class MockPromptRunner implements IPromptRunner {
  private mockResult: Partial<PromptResult> = {};
  private mockDelay = 0;
  private shouldFail = false;
  private failError: Error | null = null;

  /**
   * Configure the mock to return specific results
   */
  setMockResult(result: Partial<PromptResult>): void {
    this.mockResult = result;
  }

  /**
   * Configure a delay before returning results
   */
  setMockDelay(delayMs: number): void {
    this.mockDelay = delayMs;
  }

  /**
   * Configure the mock to simulate failure
   */
  setMockFailure(error: Error): void {
    this.shouldFail = true;
    this.failError = error;
  }

  /**
   * Reset mock configuration
   */
  reset(): void {
    this.mockResult = {};
    this.mockDelay = 0;
    this.shouldFail = false;
    this.failError = null;
  }

  async runPrompt(_prompt: string, opts?: PromptOptions): Promise<PromptResult> {
    const startTime = Date.now();

    // Check for abort
    if (opts?.signal?.aborted) {
      return {
        exitCode: -1,
        stdout: "",
        stderr: "",
        duration: 0,
        canceled: true,
      };
    }

    // Simulate delay with abort support
    if (this.mockDelay > 0) {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(resolve, this.mockDelay);
        
        if (opts?.signal) {
          opts.signal.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            reject(new Error("Aborted"));
          }, { once: true });
        }
      }).catch(() => {
        return {
          exitCode: -1,
          stdout: "",
          stderr: "",
          duration: Date.now() - startTime,
          canceled: true,
        };
      });
    }

    const duration = Date.now() - startTime;

    if (this.shouldFail && this.failError) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: this.failError.message,
        duration,
      };
    }

    return {
      exitCode: 0,
      stdout: "",
      stderr: "",
      duration,
      ...this.mockResult,
    };
  }
}
