---
allowed_tools:
  - "Bash(pnpm:*)"
  - "Bash(npm:*)"
  - "Bash(cargo:*)"
  - "Read(*)"
  - "Glob(*)"
  - "Grep(*)"
  - "TodoWrite"
---

# iKanban Security Agent

Work on: $ARGUMENTS

---

## Purpose

Perform security vulnerability checks and ensure OWASP compliance.

---

## OWASP Top 10 Checks

| # | Vulnerability | Check |
|---|--------------|-------|
| A01 | Broken Access Control | Auth on all protected routes |
| A02 | Cryptographic Failures | No hardcoded secrets |
| A03 | Injection | Parameterized queries, input validation |
| A04 | Insecure Design | Threat modeling |
| A05 | Security Misconfiguration | Proper headers, CORS |
| A06 | Vulnerable Components | Dependency audit |
| A07 | Auth Failures | Proper session handling |
| A08 | Data Integrity Failures | Input validation |
| A09 | Logging Failures | No sensitive data in logs |
| A10 | SSRF | URL validation |

---

## Security Checks

### 1. Dependency Audit

**Frontend:**
```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-frontend
pnpm audit
```

**Backend:**
```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-backend
cargo audit  # if installed
```

### 2. Secrets Scan

**Check for hardcoded secrets:**
```bash
# Search for common secret patterns
grep -r "password\s*=" --include="*.ts" --include="*.tsx" --include="*.rs"
grep -r "api_key\s*=" --include="*.ts" --include="*.tsx" --include="*.rs"
grep -r "secret\s*=" --include="*.ts" --include="*.tsx" --include="*.rs"
grep -r "token\s*=" --include="*.ts" --include="*.tsx" --include="*.rs"
```

**Verify .gitignore:**
```bash
cat .gitignore | grep -E "\.env|secrets|credentials"
```

### 3. Frontend Security

| Check | Pattern to Avoid |
|-------|------------------|
| XSS | `dangerouslySetInnerHTML` with user input |
| Secrets | API keys in client code |
| Auth | Tokens in localStorage (use httpOnly cookies) |
| CORS | Overly permissive origins |

### 4. Backend Security

| Check | Pattern to Avoid |
|-------|------------------|
| SQL Injection | String concatenation in queries |
| Command Injection | `std::process::Command` with user input |
| Path Traversal | Unvalidated file paths |
| Logging | Sensitive data in logs |

### 5. Input Validation

- [ ] All API inputs validated
- [ ] Pydantic/serde for type validation
- [ ] Length limits on strings
- [ ] Range checks on numbers

---

## Severity Levels

| Level | Description | SLA |
|-------|-------------|-----|
| Critical | Active exploit possible | Immediate fix |
| High | Security flaw, needs attention | Fix before merge |
| Medium | Defense in depth issue | Fix soon |
| Low | Best practice recommendation | Track |

---

## Checklist

### Injection
- [ ] No SQL string concatenation
- [ ] No eval() with user input
- [ ] No Command with user input
- [ ] Parameterized queries (SQLx)

### Authentication
- [ ] Auth required on protected routes
- [ ] Password hashing (if applicable)
- [ ] Session management secure

### Data Protection
- [ ] No secrets in code
- [ ] Sensitive data encrypted
- [ ] HTTPS enforced

### Logging
- [ ] No passwords in logs
- [ ] No tokens in logs
- [ ] No PII in logs

### Dependencies
- [ ] No known CVEs
- [ ] Dependencies up to date

---

## Output

```
Security Scan Complete: IKA-XX

Dependency Audit:
- Frontend: 0 vulnerabilities (pnpm audit)
- Backend: 0 vulnerabilities (cargo audit)

Secrets Scan:
- Hardcoded secrets: 0 found
- .env in .gitignore: YES

OWASP Checks:
- A01 Access Control: PASS
- A02 Crypto Failures: PASS
- A03 Injection: PASS
- A04 Insecure Design: N/A
- A05 Misconfiguration: PASS
- A06 Vulnerable Components: PASS
- A07 Auth Failures: PASS
- A08 Data Integrity: PASS
- A09 Logging Failures: PASS
- A10 SSRF: N/A

Findings:
- Critical: 0
- High: 0
- Medium: 0
- Low: 0

Status: PASS / FAIL
```
