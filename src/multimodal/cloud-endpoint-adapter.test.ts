/**
 * Unit tests for CloudEndpointAdapter
 * Requirements: REQ-3.1, REQ-3.3, REQ-9.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as https from "https";
import { EventEmitter } from "events";
import { CloudEndpointAdapter, DEFAULT_CLOUD_ENDPOINT_CONFIG } from "./cloud-endpoint-adapter";

// Mock https module
vi.mock("https", () => ({
  request: vi.fn(),
}));

describe("CloudEndpointAdapter", () => {
  let adapter: CloudEndpointAdapter;
  
  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new CloudEndpointAdapter({
      endpointUrl: "https://api.example.com/analyze",
      timeout: 5000,
      retryConfig: {
        maxAttempts: 3,
        backoffMs: [100, 200], // Short delays for testing
        retryableErrors: ["ENDPOINT_ERROR_5XX", "ENDPOINT_UNREACHABLE"],
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should use default configuration when no config provided", () => {
      const defaultAdapter = new CloudEndpointAdapter();
      const config = defaultAdapter.getConfig();
      
      expect(config.endpointUrl).toBe(DEFAULT_CLOUD_ENDPOINT_CONFIG.endpointUrl);
      expect(config.timeout).toBe(DEFAULT_CLOUD_ENDPOINT_CONFIG.timeout);
    });

    it("should merge provided configuration with defaults", () => {
      const customAdapter = new CloudEndpointAdapter({
        endpointUrl: "https://custom.api.com/analyze",
      });
      const config = customAdapter.getConfig();
      
      expect(config.endpointUrl).toBe("https://custom.api.com/analyze");
      expect(config.timeout).toBe(DEFAULT_CLOUD_ENDPOINT_CONFIG.timeout);
    });
  });

  describe("validateEndpointUrl", () => {
    it("should accept valid HTTPS URLs", () => {
      expect(() => adapter.validateEndpointUrl("https://api.example.com/analyze")).not.toThrow();
    });

    it("should reject HTTP URLs (non-TLS)", () => {
      expect(() => adapter.validateEndpointUrl("http://api.example.com/analyze"))
        .toThrow(/must use HTTPS/);
    });

    it("should reject invalid URLs", () => {
      expect(() => adapter.validateEndpointUrl("not-a-url"))
        .toThrow(/Invalid endpoint URL/);
    });

    it("should reject URLs with token in query parameters", () => {
      expect(() => adapter.validateEndpointUrl("https://api.example.com/analyze?token=secret"))
        .toThrow(/must not be included in query parameters/);
    });

    it("should reject URLs with api_key in query parameters", () => {
      expect(() => adapter.validateEndpointUrl("https://api.example.com/analyze?api_key=secret"))
        .toThrow(/must not be included in query parameters/);
    });

    it("should reject URLs with access_token in query parameters", () => {
      expect(() => adapter.validateEndpointUrl("https://api.example.com/analyze?access_token=secret"))
        .toThrow(/must not be included in query parameters/);
    });

    it("should allow URLs with non-sensitive query parameters", () => {
      expect(() => adapter.validateEndpointUrl("https://api.example.com/analyze?version=v1"))
        .not.toThrow();
    });
  });


  describe("parseResult", () => {
    it("should parse valid JSON response", () => {
      const body = JSON.stringify({
        labels: [
          { label: "cat", confidence: 0.95 },
          { label: "animal", confidence: 0.99 },
        ],
        ocrText: "Hello World",
        modelId: "test-model",
      });

      const result = adapter.parseResult(body, "test-model", 1000);

      expect(result.labels).toHaveLength(2);
      expect(result.labels[0].label).toBe("cat");
      expect(result.labels[0].confidence).toBe(0.95);
      expect(result.ocrText).toBe("Hello World");
      expect(result.modelId).toBe("test-model");
      expect(result.inferenceMode).toBe("cloud");
      expect(result.duration).toBe(1000);
    });

    it("should throw on invalid JSON", () => {
      expect(() => adapter.parseResult("not json", "test-model", 1000))
        .toThrow(/Failed to parse endpoint response/);
    });

    it("should throw on error response", () => {
      const body = JSON.stringify({
        error: { code: "MODEL_NOT_FOUND", message: "Model not found" },
      });

      expect(() => adapter.parseResult(body, "test-model", 1000))
        .toThrow(/Endpoint returned error/);
    });

    it("should handle empty labels array", () => {
      const body = JSON.stringify({ labels: [] });
      const result = adapter.parseResult(body, "test-model", 1000);
      
      expect(result.labels).toEqual([]);
    });

    it("should use provided modelId when response doesn't include one", () => {
      const body = JSON.stringify({ labels: [] });
      const result = adapter.parseResult(body, "provided-model", 1000);
      
      expect(result.modelId).toBe("provided-model");
    });
  });

  describe("analyze", () => {
    function createMockResponse(statusCode: number, body: string) {
      const response = new EventEmitter() as EventEmitter & { statusCode: number };
      response.statusCode = statusCode;
      
      return {
        response,
        emitData: () => {
          response.emit("data", Buffer.from(body));
          response.emit("end");
        },
      };
    }

    function createMockRequest() {
      const request = new EventEmitter() as EventEmitter & {
        write: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
      };
      request.write = vi.fn();
      request.end = vi.fn();
      request.destroy = vi.fn();
      return request;
    }

    it("should successfully analyze image with 200 response", async () => {
      const mockRequest = createMockRequest();
      const { response, emitData } = createMockResponse(200, JSON.stringify({
        labels: [{ label: "test", confidence: 0.9 }],
      }));

      vi.mocked(https.request).mockImplementation((_options, callback) => {
        if (callback) callback(response as never);
        setTimeout(emitData, 10);
        return mockRequest as never;
      });

      const result = await adapter.analyze("base64data", "test-model");

      expect(result.labels).toHaveLength(1);
      expect(result.labels[0].label).toBe("test");
      expect(result.inferenceMode).toBe("cloud");
    });

    it("should throw on 4xx response without retry", async () => {
      const mockRequest = createMockRequest();
      const { response, emitData } = createMockResponse(400, "Bad Request");

      vi.mocked(https.request).mockImplementation((_options, callback) => {
        if (callback) callback(response as never);
        setTimeout(emitData, 10);
        return mockRequest as never;
      });

      await expect(adapter.analyze("base64data", "test-model"))
        .rejects.toThrow(/client error/);
      
      // Should only be called once (no retries for 4xx)
      expect(https.request).toHaveBeenCalledTimes(1);
    });

    it("should reject URLs without HTTPS", async () => {
      const httpAdapter = new CloudEndpointAdapter({
        endpointUrl: "http://api.example.com/analyze",
      });

      await expect(httpAdapter.analyze("base64data", "test-model"))
        .rejects.toThrow(/must use HTTPS/);
    });

    it("should reject URLs with tokens in query parameters", async () => {
      const tokenAdapter = new CloudEndpointAdapter({
        endpointUrl: "https://api.example.com/analyze?token=secret",
      });

      await expect(tokenAdapter.analyze("base64data", "test-model"))
        .rejects.toThrow(/must not be included in query parameters/);
    });
  });


  describe("isAvailable", () => {
    it("should return false when endpoint URL is empty", async () => {
      const emptyAdapter = new CloudEndpointAdapter({ endpointUrl: "" });
      const result = await emptyAdapter.isAvailable();
      expect(result).toBe(false);
    });

    it("should return false for HTTP URLs", async () => {
      const httpAdapter = new CloudEndpointAdapter({ 
        endpointUrl: "http://api.example.com/analyze" 
      });
      const result = await httpAdapter.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe("getConfig and updateConfig", () => {
    it("should return a copy of the configuration", () => {
      const config = adapter.getConfig();
      config.endpointUrl = "modified";
      
      expect(adapter.getConfig().endpointUrl).toBe("https://api.example.com/analyze");
    });

    it("should update configuration", () => {
      adapter.updateConfig({ timeout: 10000 });
      
      expect(adapter.getConfig().timeout).toBe(10000);
      expect(adapter.getConfig().endpointUrl).toBe("https://api.example.com/analyze");
    });

    it("should update retry configuration", () => {
      adapter.updateConfig({ 
        retryConfig: { 
          maxAttempts: 5,
          backoffMs: [500, 1000, 2000],
          retryableErrors: ["ENDPOINT_ERROR_5XX"],
        } 
      });
      
      expect(adapter.getRetryConfig().maxAttempts).toBe(5);
      expect(adapter.getRetryConfig().backoffMs).toEqual([500, 1000, 2000]);
    });
  });

  describe("retry behavior", () => {
    function createMockRequest() {
      const request = new EventEmitter() as EventEmitter & {
        write: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
      };
      request.write = vi.fn();
      request.end = vi.fn();
      request.destroy = vi.fn();
      return request;
    }

    function createMockResponse(statusCode: number, body: string) {
      const response = new EventEmitter() as EventEmitter & { statusCode: number };
      response.statusCode = statusCode;
      
      return {
        response,
        emitData: () => {
          response.emit("data", Buffer.from(body));
          response.emit("end");
        },
      };
    }

    it("should retry on 5xx errors with exponential backoff", async () => {
      const mockRequest = createMockRequest();
      let callCount = 0;

      vi.mocked(https.request).mockImplementation((_options, callback) => {
        callCount++;
        const statusCode = callCount < 3 ? 500 : 200;
        const body = callCount < 3 
          ? "Server Error" 
          : JSON.stringify({ labels: [{ label: "success", confidence: 1.0 }] });
        
        const { response, emitData } = createMockResponse(statusCode, body);
        if (callback) callback(response as never);
        setTimeout(emitData, 10);
        return mockRequest as never;
      });

      const result = await adapter.analyze("base64data", "test-model");

      expect(callCount).toBe(3);
      expect(result.labels[0].label).toBe("success");
    });

    it("should fail after max retries on persistent 5xx errors", async () => {
      const mockRequest = createMockRequest();

      vi.mocked(https.request).mockImplementation((_options, callback) => {
        const { response, emitData } = createMockResponse(500, "Server Error");
        if (callback) callback(response as never);
        setTimeout(emitData, 10);
        return mockRequest as never;
      });

      await expect(adapter.analyze("base64data", "test-model"))
        .rejects.toThrow(/after 3 attempts/);
      
      expect(https.request).toHaveBeenCalledTimes(3);
    });
  });
});
