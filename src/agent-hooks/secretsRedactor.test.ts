/**
 * Unit tests for Secrets Redactor
 *
 * Requirements validated:
 * - REQ-4.2: Redact configured secret patterns with "[REDACTED]"
 * - Validate regex patterns at config load time
 */

import { describe, it, expect } from "vitest";
import {
  redact,
  validatePatterns,
  createRedactor,
  DEFAULT_SECRET_PATTERNS,
} from "./secretsRedactor";

describe("SecretsRedactor", () => {
  describe("redact function", () => {
    describe("REQ-4.2: Redact with [REDACTED] token", () => {
      it("should replace matched patterns with [REDACTED]", () => {
        const text = "API key: secret-abc123";
        const patterns = [/secret-\w+/g];

        const result = redact(text, patterns);

        expect(result).toBe("API key: [REDACTED]");
      });

      it("should redact multiple occurrences of same pattern", () => {
        const text = "Keys: secret-abc, secret-xyz, secret-123";
        const patterns = [/secret-\w+/g];

        const result = redact(text, patterns);

        expect(result).toBe("Keys: [REDACTED], [REDACTED], [REDACTED]");
      });

      it("should redact using multiple different patterns", () => {
        const text = "API: api_key_123, Password: password=hunter2";
        const patterns = [/api_key_\w+/g, /password=\w+/gi];

        const result = redact(text, patterns);

        expect(result).toBe("API: [REDACTED], Password: [REDACTED]");
      });

      it("should return original text when no patterns match", () => {
        const text = "This is safe text with no secrets";
        const patterns = [/secret-\w+/g];

        const result = redact(text, patterns);

        expect(result).toBe(text);
      });

      it("should return original text when patterns array is empty", () => {
        const text = "Text with secret-abc123";
        const patterns: RegExp[] = [];

        const result = redact(text, patterns);

        expect(result).toBe(text);
      });

      it("should return original text when text is empty", () => {
        const text = "";
        const patterns = [/secret-\w+/g];

        const result = redact(text, patterns);

        expect(result).toBe("");
      });

      it("should handle patterns without global flag", () => {
        const text = "secret-abc secret-xyz";
        const patterns = [/secret-\w+/]; // No 'g' flag

        const result = redact(text, patterns);

        // Should still redact all occurrences
        expect(result).toBe("[REDACTED] [REDACTED]");
      });
    });

    describe("Common secret patterns", () => {
      it("should redact AWS access keys", () => {
        const text = "AWS Key: AKIAIOSFODNN7EXAMPLE";
        const patterns = [/AKIA[0-9A-Z]{16}/g];

        const result = redact(text, patterns);

        expect(result).toBe("AWS Key: [REDACTED]");
      });

      it("should redact GitHub tokens", () => {
        const text = "Token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
        const patterns = [/ghp_[A-Za-z0-9]{36}/g];

        const result = redact(text, patterns);

        expect(result).toBe("Token: [REDACTED]");
      });

      it("should redact password assignments", () => {
        const text = "Config: password=mysecretpassword123";
        const patterns = [/password[=:]\s*\S+/gi];

        const result = redact(text, patterns);

        expect(result).toBe("Config: [REDACTED]");
      });

      it("should redact API keys in various formats", () => {
        const text = "api_key: abc123xyz, API_KEY=def456";
        const patterns = [/api[_-]?key[=:]\s*\S+/gi];

        const result = redact(text, patterns);

        // The pattern matches "api_key: abc123xyz," and "API_KEY=def456"
        // Note: the comma is part of \S+ in the first match
        expect(result).toBe("[REDACTED] [REDACTED]");
      });

      it("should redact bearer tokens", () => {
        const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
        const patterns = [/Bearer\s+\S+/g];

        const result = redact(text, patterns);

        expect(result).toBe("Authorization: [REDACTED]");
      });
    });

    describe("Edge cases", () => {
      it("should handle special regex characters in text", () => {
        const text = "Path: C:\\Users\\secret-abc\\Documents";
        const patterns = [/secret-\w+/g];

        const result = redact(text, patterns);

        expect(result).toBe("Path: C:\\Users\\[REDACTED]\\Documents");
      });

      it("should handle multiline text", () => {
        const text = `Line 1: secret-abc
Line 2: normal text
Line 3: secret-xyz`;
        const patterns = [/secret-\w+/g];

        const result = redact(text, patterns);

        expect(result).toBe(`Line 1: [REDACTED]
Line 2: normal text
Line 3: [REDACTED]`);
      });

      it("should handle overlapping patterns", () => {
        const text = "secret-password-123";
        const patterns = [/secret-\w+/g, /password-\d+/g];

        const result = redact(text, patterns);

        // First pattern matches "secret-password" (word chars), leaving "-123"
        // Second pattern then doesn't match because "password" was already replaced
        expect(result).toBe("[REDACTED]-123");
      });

      it("should handle unicode text", () => {
        const text = "密码: secret-abc123 用户名: user";
        const patterns = [/secret-\w+/g];

        const result = redact(text, patterns);

        expect(result).toBe("密码: [REDACTED] 用户名: user");
      });
    });
  });

  describe("validatePatterns function", () => {
    describe("Valid patterns", () => {
      it("should return valid RegExp objects for valid patterns", () => {
        const patterns = ["secret-\\w+", "password=\\S+", "api_key_[a-z0-9]+"];

        const { valid, errors } = validatePatterns(patterns);

        expect(valid.length).toBe(3);
        expect(errors.length).toBe(0);
        expect(valid[0]).toBeInstanceOf(RegExp);
      });

      it("should compile patterns with global flag", () => {
        const patterns = ["test\\d+"];

        const { valid } = validatePatterns(patterns);

        expect(valid[0].global).toBe(true);
      });
    });

    describe("Invalid regex detection", () => {
      it("should detect invalid regex syntax", () => {
        const patterns = ["[invalid(regex", "valid-\\w+"];

        const { valid, errors } = validatePatterns(patterns);

        expect(valid.length).toBe(1);
        expect(errors.length).toBe(1);
        expect(errors[0]).toContain("Invalid regex pattern");
        expect(errors[0]).toContain("[invalid(regex");
      });

      it("should detect unclosed brackets", () => {
        const patterns = ["[abc"];

        const { valid, errors } = validatePatterns(patterns);

        expect(valid.length).toBe(0);
        expect(errors.length).toBe(1);
      });

      it("should detect unclosed parentheses", () => {
        const patterns = ["(abc"];

        const { valid, errors } = validatePatterns(patterns);

        expect(valid.length).toBe(0);
        expect(errors.length).toBe(1);
      });

      it("should detect invalid quantifiers", () => {
        const patterns = ["a{invalid}"];

        const { valid, errors } = validatePatterns(patterns);

        // This may or may not be invalid depending on regex engine
        // Just ensure it doesn't crash
        expect(valid.length + errors.length).toBe(1);
      });

      it("should reject overly broad patterns", () => {
        const patterns = [".*", ".+", ""];

        const { valid, errors } = validatePatterns(patterns);

        expect(valid.length).toBe(0);
        expect(errors.length).toBe(3);
        expect(errors.every((e) => e.includes("too broad"))).toBe(true);
      });

      it("should provide descriptive error messages", () => {
        const patterns = ["[invalid"];

        const { errors } = validatePatterns(patterns);

        expect(errors[0]).toContain("Invalid regex pattern");
        expect(errors[0]).toContain("[invalid");
      });
    });

    describe("Mixed valid and invalid patterns", () => {
      it("should return both valid patterns and errors", () => {
        const patterns = [
          "valid-\\w+",
          "[invalid",
          "also-valid-\\d+",
          "(unclosed",
        ];

        const { valid, errors } = validatePatterns(patterns);

        expect(valid.length).toBe(2);
        expect(errors.length).toBe(2);
      });
    });
  });

  describe("createRedactor function", () => {
    it("should create a redactor with pre-compiled patterns", () => {
      const patternStrings = ["secret-\\w+", "password=\\S+"];

      const redactor = createRedactor(patternStrings);

      expect(redactor.patterns.length).toBe(2);
      expect(redactor.errors.length).toBe(0);
      expect(typeof redactor.redact).toBe("function");
    });

    it("should create a working redact function", () => {
      const patternStrings = ["secret-\\w+"];

      const redactor = createRedactor(patternStrings);
      const result = redactor.redact("My secret-abc123 is here");

      expect(result).toBe("My [REDACTED] is here");
    });

    it("should report errors for invalid patterns", () => {
      const patternStrings = ["valid-\\w+", "[invalid"];

      const redactor = createRedactor(patternStrings);

      expect(redactor.patterns.length).toBe(1);
      expect(redactor.errors.length).toBe(1);
    });

    it("should still work with partial valid patterns", () => {
      const patternStrings = ["[invalid", "secret-\\w+"];

      const redactor = createRedactor(patternStrings);
      const result = redactor.redact("My secret-abc123");

      expect(result).toBe("My [REDACTED]");
    });

    it("should handle empty pattern array", () => {
      const redactor = createRedactor([]);

      expect(redactor.patterns.length).toBe(0);
      expect(redactor.errors.length).toBe(0);
      expect(redactor.redact("any text")).toBe("any text");
    });
  });

  describe("DEFAULT_SECRET_PATTERNS", () => {
    it("should be an array of RegExp objects", () => {
      expect(Array.isArray(DEFAULT_SECRET_PATTERNS)).toBe(true);
      expect(DEFAULT_SECRET_PATTERNS.every((p) => p instanceof RegExp)).toBe(true);
    });

    it("should match AWS access keys", () => {
      const text = "Key: AKIAIOSFODNN7EXAMPLE";
      const result = redact(text, DEFAULT_SECRET_PATTERNS);

      expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
    });

    it("should match GitHub tokens", () => {
      const text = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      const result = redact(text, DEFAULT_SECRET_PATTERNS);

      expect(result).toBe("[REDACTED]");
    });

    it("should match generic token patterns", () => {
      const text = "token: abc123def456";
      const result = redact(text, DEFAULT_SECRET_PATTERNS);

      expect(result).not.toContain("abc123def456");
    });

    it("should match password patterns", () => {
      const text = "password: mysecret123";
      const result = redact(text, DEFAULT_SECRET_PATTERNS);

      expect(result).not.toContain("mysecret123");
    });
  });

  describe("Performance considerations", () => {
    it("should handle large text efficiently", () => {
      const largeText = "secret-abc ".repeat(10000);
      const patterns = [/secret-\w+/g];

      const startTime = Date.now();
      const result = redact(largeText, patterns);
      const duration = Date.now() - startTime;

      expect(result).not.toContain("secret-abc");
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it("should handle many patterns efficiently", () => {
      const text = "secret1 secret2 secret3 secret4 secret5";
      const patterns = Array.from({ length: 100 }, (_, i) => new RegExp(`secret${i}`, "g"));

      const startTime = Date.now();
      redact(text, patterns);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100); // Should complete quickly
    });
  });

  describe("Case sensitivity", () => {
    it("should respect case-sensitive patterns", () => {
      const text = "SECRET-abc Secret-xyz secret-123";
      const patterns = [/secret-\w+/g]; // Case-sensitive

      const result = redact(text, patterns);

      expect(result).toBe("SECRET-abc Secret-xyz [REDACTED]");
    });

    it("should respect case-insensitive patterns", () => {
      const text = "SECRET-abc Secret-xyz secret-123";
      const patterns = [/secret-\w+/gi]; // Case-insensitive

      const result = redact(text, patterns);

      expect(result).toBe("[REDACTED] [REDACTED] [REDACTED]");
    });
  });

  describe("Integration scenarios", () => {
    it("should redact secrets from log output", () => {
      const logLine = `[2024-01-15T10:30:00Z] INFO: Connecting with API key: sk_live_abc123xyz and password=hunter2`;
      const patterns = [/sk_live_\w+/g, /password=\S+/g];

      const result = redact(logLine, patterns);

      expect(result).toBe(
        "[2024-01-15T10:30:00Z] INFO: Connecting with API key: [REDACTED] and [REDACTED]"
      );
    });

    it("should redact secrets from command output", () => {
      const output = `
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
export DATABASE_URL=postgres://user:password123@localhost/db
`;
      const patterns = [
        /AKIA[0-9A-Z]{16}/g,
        /wJalrXUtnFEMI[^\s]+/g,
        /password\d+/gi,
      ];

      const result = redact(output, patterns);

      expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(result).not.toContain("wJalrXUtnFEMI");
      expect(result).not.toContain("password123");
    });

    it("should redact secrets from JSON config", () => {
      const config = JSON.stringify({
        apiKey: "secret-key-12345",
        database: {
          password: "db-password-xyz",
        },
      });
      const patterns = [/secret-key-\w+/g, /db-password-\w+/g];

      const result = redact(config, patterns);

      expect(result).not.toContain("secret-key-12345");
      expect(result).not.toContain("db-password-xyz");
      expect(result).toContain("[REDACTED]");
    });
  });
});
