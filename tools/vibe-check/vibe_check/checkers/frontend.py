"""Frontend quality checker (pnpm/npm/yarn + TypeScript)."""

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from rich.console import Console

from ..detectors import FrontendStack


@dataclass
class CheckResult:
    """Result of a single check."""
    name: str
    passed: bool
    output: str
    command: str


class FrontendChecker:
    """Quality checker for frontend (TypeScript/React) projects."""

    def __init__(self, stack: FrontendStack, fix: bool = False, verbose: bool = False):
        self.stack = stack
        self.fix = fix
        self.verbose = verbose
        self.console = Console()

    def _run_command(self, name: str, args: List[str]) -> CheckResult:
        """Run a command and return the result."""
        cmd = [self.stack.package_manager] + args
        cmd_str = " ".join(cmd)

        if self.verbose:
            self.console.print(f"  [dim]Running: {cmd_str}[/dim]")

        try:
            result = subprocess.run(
                cmd,
                cwd=self.stack.path,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minute timeout
            )
            passed = result.returncode == 0
            output = result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            passed = False
            output = "Command timed out after 5 minutes"
        except FileNotFoundError:
            passed = False
            output = f"Command not found: {self.stack.package_manager}"

        return CheckResult(
            name=name,
            passed=passed,
            output=output.strip(),
            command=cmd_str,
        )

    def check_lint(self) -> CheckResult:
        """Run ESLint."""
        if not self.stack.has_eslint:
            return CheckResult(
                name="lint",
                passed=True,
                output="Skipped: ESLint not configured",
                command="",
            )

        args = ["lint"]
        if self.fix:
            args.append("--fix")

        return self._run_command("lint", args)

    def check_typecheck(self) -> CheckResult:
        """Run TypeScript type checking."""
        if not self.stack.has_typescript:
            return CheckResult(
                name="typecheck",
                passed=True,
                output="Skipped: TypeScript not configured",
                command="",
            )

        # Try 'check' script first (common in Vite projects), then 'typecheck'
        return self._run_command("typecheck", ["check"])

    def check_format(self) -> CheckResult:
        """Run Prettier formatting check."""
        if self.fix:
            return self._run_command("format", ["format"])
        else:
            # Check mode - try format:check or prettier --check
            return self._run_command("format", ["format", "--check"])

    def run_all(self) -> List[CheckResult]:
        """Run all frontend checks."""
        results = []

        self.console.print(f"\n[bold blue]Frontend[/bold blue] ({self.stack.path})")
        self.console.print(f"  Package manager: {self.stack.package_manager}")

        # Lint
        self.console.print("  [dim]Checking lint...[/dim]", end="")
        result = self.check_lint()
        results.append(result)
        self._print_result(result)

        # TypeCheck
        self.console.print("  [dim]Checking types...[/dim]", end="")
        result = self.check_typecheck()
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
