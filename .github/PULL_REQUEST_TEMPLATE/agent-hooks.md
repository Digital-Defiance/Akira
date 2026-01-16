# Agent Hooks Pull Request

## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)

---

## Pre-Merge Checklist

### Schema & Configuration

- [ ] Schema file present at `src/agent-hooks/schema/.kiro.hooks.schema.json`
- [ ] Schema validates correctly against JSON Schema draft-07
- [ ] All hook configuration fields documented in schema
- [ ] Default values specified for optional fields (concurrency=4, enabled=true, timeout=30000)
- [ ] Schema version field included for migration support

### Testing

- [ ] All unit tests passing (`yarn test src/agent-hooks/`)
- [ ] Config Loader tests cover valid/invalid schema scenarios
- [ ] Event Registry tests verify no duplicate registrations
- [ ] Hook Manager tests cover filtering and enable/disable logic
- [ ] Secrets Redactor tests validate pattern matching and redaction
- [ ] Execution Engine tests cover concurrency, timeout, and retry behavior
- [ ] Integration tests simulate VS Code events end-to-end
- [ ] Test coverage meets minimum threshold

### Logging

- [ ] OutputLogger properly initialized and used throughout
- [ ] All errors logged with appropriate context (hook ID, timestamps)
- [ ] Execution records include start/end timestamps
- [ ] Log format follows established pattern: `[timestamp] [hook-id] LEVEL: message`
- [ ] Structured log entries use correct JSON format

### Security - Secrets Redaction

- [ ] Secrets Redactor integrated with OutputLogger
- [ ] All log output passes through redaction before writing
- [ ] Prompt content redacted before execution logging
- [ ] stdout/stderr redacted in execution results
- [ ] Secret patterns validated at config load time
- [ ] Invalid regex patterns rejected with clear error messages
- [ ] Overly broad patterns (e.g., `.*`, `.+`) rejected
- [ ] `[REDACTED]` token used consistently for replacements
- [ ] No sensitive data exposed in error messages or stack traces

### Git Trigger Security

- [ ] Git triggers require `allowGit: true` explicitly set
- [ ] Git triggers require `repoRoot` to be specified
- [ ] Only hooks matching repository root execute on git events
- [ ] Git safeguards documented in user-facing documentation

### Documentation

- [ ] `docs/agent-hooks.md` updated with any new features
- [ ] Configuration schema changes documented
- [ ] New trigger types or actions documented
- [ ] Troubleshooting section updated if applicable
- [ ] Code comments added for complex logic

### Breaking Changes

- [ ] No breaking changes introduced
- [ ] OR breaking changes documented below with migration guide

<!-- If breaking changes, describe them here:
### Breaking Changes Description

**What changed:**

**Migration steps:**

**Affected configurations:**
-->

---

## Reviewer Notes

<!-- Any specific areas you'd like reviewers to focus on -->

## Related Issues

<!-- Link any related issues: Fixes #123, Relates to #456 -->

---

## Final Verification

- [ ] Code follows project style guidelines
- [ ] No console.log or debug statements left in code
- [ ] All TODO comments addressed or tracked in issues
- [ ] CHANGELOG.md updated (if applicable)
- [ ] Ready for peer review
