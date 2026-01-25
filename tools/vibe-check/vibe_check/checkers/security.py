"""Security checker (audit dependencies, scan for secrets)."""

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from rich.console import Console

from ..detectors import FrontendStack, BackendStack


@dataclass
class CheckResult:
    """Result of a single check."""
    name: str
    passed: bool
    output: str
    command: str


# Patterns that indicate potential secrets
SECRET_PATTERNS = [
    (r'password\s*=\s*["\'][^"\']+["\']', "hardcoded password"),
    (r'secret\s*=\s*["\'][^"\']+["\']', "hardcoded secret"),
    (r'api_key\s*=\s*["\'][^"\']+["\']', "hardcoded API key"),
    (r'token\s*=\s*["\'][^"\']+["\']', "hardcoded token"),
    (r'AWS_SECRET_ACCESS_KEY\s*=\s*["\'][^"\']+["\']', "AWS secret key"),
    (r'PRIVATE_KEY\s*=\s*["\'][^"\']+["\']', "private key"),
    (r'-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----', "private key file"),
    (r'ghp_[a-zA-Z0-9]{36}', "GitHub personal access token"),
    (r'gho_[a-zA-Z0-9]{36}', "GitHub OAuth token"),
    (r'sk-[a-zA-Z0-9]{48}', "OpenAI API key"),
    (r'sk_live_[a-zA-Z0-9]{24,}', "Stripe live key"),
]

# Files/directories to skip
SKIP_PATTERNS = [
    r'node_modules',
    r'\.git',
    r'target',
    r'dist',
    r'build',
    r'\.venv',
    r'__pycache__',
    r'\.sqlx',
    r'\.next',
    r'\.env\.example',
    r'\.env\.sample',
    r'README',
    r'CHANGELOG',
    r'\.md$',
    r'\.lock$',
    r'package-lock\.json',
    r'pnpm-lock\.yaml',
    r'Cargo\.lock',
]


class SecurityChecker:
    """Security checker for projects."""

    def __init__(
        self,
        root: Path,
        frontend: Optional[FrontendStack] = None,
        backend: Optional[BackendStack] = None,
        verbose: bool = False,
    ):
        self.root = root
        self.frontend = frontend
        self.backend = backend
        self.verbose = verbose
        self.console = Console()

    def _should_skip(self, path: Path) -> bool:
        """Check if path should be skipped."""
        path_str = str(path)
        for pattern in SKIP_PATTERNS:
            if re.search(pattern, path_str):
                return True
        return False

    def _run_command(self, name: str, args: List[str], cwd: Path) -> CheckResult:
        """Run a command and return the result."""
        cmd_str = " ".join(args)

        if self.verbose:
            self.console.print(f"  [dim]Running: {cmd_str}[/dim]")

        try:
            result = subprocess.run(
                args,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=120,
            )
            # For audit, non-zero exit means vulnerabilities found
            passed = result.returncode == 0
            output = result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            passed = False
            output = "Command timed out"
        except FileNotFoundError:
            passed = False
            output = f"Command not found: {args[0]}"

        return CheckResult(
            name=name,
            passed=passed,
            output=output.strip(),
            command=cmd_str,
        )

    def check_npm_audit(self) -> Optional[CheckResult]:
        """Run npm/pnpm audit for frontend dependencies."""
        if not self.frontend:
            return None

        pm = self.frontend.package_manager
        if pm == "pnpm":
            args = ["pnpm", "audit", "--audit-level=high"]
        elif pm == "npm":
            args = ["npm", "audit", "--audit-level=high"]
        elif pm == "yarn":
            args = ["yarn", "audit", "--level", "high"]
        else:
            return None

        return self._run_command("npm-audit", args, self.frontend.path)

    def check_cargo_audit(self) -> Optional[CheckResult]:
        """Run cargo audit for Rust dependencies (if installed)."""
        if not self.backend:
            return None

        # Check if cargo-audit is installed
        try:
            subprocess.run(
                ["cargo", "audit", "--version"],
                capture_output=True,
                timeout=10,
            )
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return CheckResult(
                name="cargo-audit",
                passed=True,
                output="Skipped: cargo-audit not installed (run: cargo install cargo-audit)",
                command="",
            )

        return self._run_command(
            "cargo-audit",
            ["cargo", "audit"],
            self.backend.path,
        )

    def check_secrets(self) -> CheckResult:
        """Scan for hardcoded secrets in source files."""
        findings = []
        files_scanned = 0

        # Extensions to scan
        extensions = {".ts", ".tsx", ".js", ".jsx", ".rs", ".py", ".json", ".yaml", ".yml", ".toml", ".env"}

        for path in self.root.rglob("*"):
            if not path.is_file():
                continue
            if self._should_skip(path):
                continue
            if path.suffix not in extensions:
                continue

            files_scanned += 1

            try:
                content = path.read_text(errors="ignore")
                for pattern, description in SECRET_PATTERNS:
                    matches = re.finditer(pattern, content, re.IGNORECASE)
                    for match in matches:
                        # Get line number
                        line_num = content[:match.start()].count("\n") + 1
                        # Skip if it looks like an env var reference
                        matched_text = match.group(0)
                        if "${" in matched_text or "$(" in matched_text:
                            continue
                        # Skip if it's clearly a placeholder
                        if any(x in matched_text.lower() for x in ["xxx", "your_", "example", "placeholder"]):
                            continue

                        rel_path = path.relative_to(self.root)
                        findings.append(f"{rel_path}:{line_num} - {description}")
            except Exception:
                pass

        if findings:
            output = f"Found {len(findings)} potential secret(s):\n" + "\n".join(findings[:10])
            if len(findings) > 10:
                output += f"\n... and {len(findings) - 10} more"
            return CheckResult(
                name="secrets-scan",
                passed=False,
                output=output,
                command=f"scanned {files_scanned} files",
            )

        return CheckResult(
            name="secrets-scan",
            passed=True,
            output=f"No secrets found in {files_scanned} files",
            command=f"scanned {files_scanned} files",
        )

    def run_all(self) -> List[CheckResult]:
        """Run all security checks."""
        results = []

        self.console.print(f"\n[bold magenta]Security[/bold magenta] ({self.root})")

        # NPM/pnpm audit
        if self.frontend:
            self.console.print("  [dim]Auditing frontend dependencies...[/dim]", end="")
            result = self.check_npm_audit()
            if result:
                results.append(result)
                self._print_result(result)

        # Cargo audit (optional)
        if self.backend:
            self.console.print("  [dim]Auditing backend dependencies...[/dim]", end="")
            result = self.check_cargo_audit()
            if result:
                results.append(result)
                self._print_result(result)

        # Secrets scan
        self.console.print("  [dim]Scanning for secrets...[/dim]", end="")
        result = self.check_secrets()
        results.append(result)
        self._print_result(result)

        return results

    def _print_result(self, result: CheckResult):
        """Print a check result."""
        if result.passed:
            self.console.print(f" [green]✓[/green] {result.name}")
        else:
            self.console.print(f" [red]✗[/red] {result.name}")
            if self.verbose and result.output:
                for line in result.output.split("\n")[:10]:
                    self.console.print(f"    [dim]{line}[/dim]")
