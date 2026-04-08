# opencrawdio Security Tests

Comprehensive security test suite for the opencrawdio project.

## Overview

This test suite validates the security posture of opencrawdio across multiple attack vectors and vulnerabilities common in file-based agents and TUI applications.

## Test Categories

### 1. Path Traversal Protection (`path-traversal.test.ts`)
**Tests**: 11 test cases

Validates protection against directory traversal attacks:
- `../../../` relative path exploitation
- Absolute path access to sensitive files (`/etc/passwd`, `/root`)
- URL-encoded path traversal (`..%2F..%2F`)
- Null byte injection (`file.txt\0`)
- Symbolic link traversal
- Path normalization bypasses
- Windows-style paths on Unix systems

**Key Security Concerns:**
- Prevents reading files outside project directory
- Blocks access to system files and other users' files
- Ensures path normalization before validation

---

### 2. Command Injection Protection (`command-injection.test.ts`)
**Tests**: 13 test cases

Validates protection against command injection attacks:
- Shell metacharacters (`;`, `&&`, `|`, `` ` ``, `$()`)
- Parameter injection in commands
- Background process operators (`&`)
- Command execution via filenames
- Environment variable manipulation
- Argument injection (`--help`, `-r`)

**Key Security Concerns:**
- All command executions require user approval
- Shell metacharacters are detected and handled safely
- Prevents chained command execution
- Blocks environment variable tampering

---

### 3. Input Validation (`input-validation.test.ts`)
**Tests**: 22 test cases

Validates robust input handling and edge cases:
- Extremely long messages (1MB+)
- Null bytes in input
- Unicode, emoji, and non-ASCII characters
- Control characters (`\r`, `\n`, `\t`, `\x00`)
- ReDoS (Regular Expression Denial of Service)
- Prototype pollution attempts
- Type confusion (non-string inputs)
- Empty and whitespace-only inputs

**Key Security Concerns:**
- No crashes or hangs on malformed input
- ReDoS protection (< 1 second processing time)
- Safe handling of all character encodings
- Type safety for all inputs

---

### 4. Credential & Secret Exposure (`credential-exposure.test.ts`)
**Tests**: 17 test cases

Validates protection of sensitive credentials:
- Environment files (`.env`, `.env.local`, `.env.production`)
- SSH keys (`.ssh/id_rsa`, `.ssh/id_ed25519`)
- AWS credentials (`.aws/credentials`)
- Git credentials (`.git/config`, `.git-credentials`)
- JWT token detection and masking
- API key patterns (OpenAI, GitHub, AWS)
- Private key detection
- Telegram bot token protection
- Database connection string masking

**Key Security Concerns:**
- Sensitive files require special authorization
- Token patterns should be detected and masked (future enhancement)
- No credential leakage in logs or responses
- Bot tokens never exposed in status messages

---

### 5. Markdown Injection Protection (`markdown-injection.test.ts`)
**Tests**: 23 test cases

Validates Telegram Markdown escaping:
- Special Markdown characters (`_`, `*`, `[`, `]`, `` ` ``, etc.)
- Link injection attempts
- HTML entity injection
- Code block breakout attempts
- XSS-like patterns
- Newline and whitespace injection
- Unicode attacks (RTL override, zero-width characters)
- Homoglyph attacks (Cyrillic/Latin lookalikes)

**Key Security Concerns:**
- All special characters escaped for Telegram
- No unintended formatting or link injection
- Protection against spoofing via Unicode
- Safe handling of all control characters

---

### 6. Authorization & Access Control (`authorization.test.ts`)
**Tests**: 22 test cases

Validates access control and permission enforcement:
- Approval requirement for destructive operations
- System-level command protection (`sudo`, `su`)
- Network operation approval
- File system permission respect
- User isolation (no cross-user file access)
- Rate limiting resilience (100 concurrent requests)
- Privilege escalation prevention
- Session isolation (TUI vs Telegram)
- Command blacklist (fork bombs, disk wiping)

**Key Security Concerns:**
- All destructive operations require approval
- No privilege escalation
- Respects OS-level file permissions
- Handles high request volume without crashes
- Session data properly isolated

---

## Running Security Tests

```bash
# Run all security tests
pnpm test tests/security

# Run specific security test category
pnpm test tests/security/path-traversal.test.ts
pnpm test tests/security/command-injection.test.ts
pnpm test tests/security/input-validation.test.ts
pnpm test tests/security/credential-exposure.test.ts
pnpm test tests/security/markdown-injection.test.ts
pnpm test tests/security/authorization.test.ts

# Run with coverage
pnpm test:coverage -- tests/security

# Run in watch mode
pnpm test:watch -- tests/security
```

## Test Statistics

| Category | Tests | Focus Area |
|----------|-------|------------|
| Path Traversal | 11 | File system access control |
| Command Injection | 13 | Command execution safety |
| Input Validation | 22 | Robust input handling |
| Credential Exposure | 17 | Secret protection |
| Markdown Injection | 23 | Telegram output sanitization |
| Authorization | 22 | Access control & permissions |
| **Total** | **108** | **Comprehensive security coverage** |

## Security Best Practices

### Current Implementation
✅ Path validation and normalization  
✅ Command execution approval workflow  
✅ Markdown escaping for Telegram  
✅ Graceful error handling  
✅ Type safety with TypeScript  

### Future Enhancements
🔄 Token/secret detection and masking  
🔄 Sandboxed command execution  
🔄 Rate limiting for Telegram API  
🔄 Audit logging for security events  
🔄 Content Security Policy for outputs  

## CI/CD Integration

Security tests run automatically on:
- Every push to main branch
- Pull request creation
- Manual workflow dispatch

See `.github/workflows/security-tests.yml` for configuration.

## Reporting Security Issues

If you discover a security vulnerability, please:
1. **Do NOT** open a public issue
2. Email the maintainer directly
3. Include detailed steps to reproduce
4. Allow time for patch development before disclosure

## Test Maintenance

### When to Update Tests
- Adding new file operations or commands
- Implementing new user input paths
- Integrating external APIs or services
- Changing authentication/authorization logic
- Adding new Telegram response formats

### Writing New Security Tests
1. Identify the attack vector
2. Create test cases for common exploits
3. Test edge cases and boundary conditions
4. Verify graceful failure, not crashes
5. Document expected security behavior

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE: Common Weakness Enumeration](https://cwe.mitre.org/)
- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [Path Traversal Attacks](https://owasp.org/www-community/attacks/Path_Traversal)
- [Telegram Bot Security](https://core.telegram.org/bots/security)

---

**Last Updated**: 2026-04-07  
**Maintained by**: opencrawdio security team
