"""Backend quality checker (Rust/Cargo)."""

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List

from rich.console import Console

from ..detectors import BackendStack


@dataclass
class CheckResult:
    """Result of a single check."""
    name: str
    passed: bool
    output: str
    command: str


class BackendChecker:
    """Quality checker for backend (Rust) projects."""

    def __init__(
        self,
        stack: BackendStack,
        fix: bool = False,
        verbose: bool = False,
        packages: List[str] = None,
    ):
        self.stack = stack
        self.fix = fix
        self.verbose = verbose
        self.packages = packages or []
        self.console = Console()

    def _run_command(self, name: str, args: List[str]) -> CheckResult:
        """Run a cargo command and return the result."""
        cmd = ["cargo"] + args
        cmd_str = " ".join(cmd)

        if self.verbose:
            self.console.print(f"  [dim]Running: {cmd_str}[/dim]")

        try:
            result = subprocess.run(
                cmd,
                cwd=self.stack.path,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout for cargo
            )
            passed = result.returncode == 0
            output = result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            passed = False
            output = "Command timed out after 10 minutes"
        except FileNotFoundError:
            passed = False
            output = "Command not found: cargo"

        return CheckResult(
            name=name,
            passed=passed,
            output=output.strip(),
            command=cmd_str,
        )

    def check_format(self) -> CheckResult:
        """Run cargo fmt."""
        if self.fix:
            args = ["fmt", "--all"]
        else:
            args = ["fmt", "--all", "--check"]

        return self._run_command("format", args)

    def check_compile(self) -> CheckResult:
        """Run cargo check for compilation errors."""
        args = ["check"]
        if self.packages:
            # Use --package for specific packages (faster)
            for pkg in self.packages:
                args.extend(["--package", pkg])
        elif self.stack.has_workspace:
            args.append("--workspace")

        return self._run_command("compile", args)

    def check_clippy(self) -> CheckResult:
        """Run cargo clippy for lints."""
        args = ["clippy"]
        if self.packages:
            # Use --package for specific packages (faster)
            for pkg in self.packages:
                args.extend(["--package", pkg])
        elif self.stack.has_workspace:
            args.append("--workspace")

        # Add deny warnings flag
        args.extend(["--", "-D", "warnings"])

        if self.fix:
            # Insert --fix before --
            args.insert(args.index("--"), "--fix")
            args.insert(args.index("--"), "--allow-dirty")

        return self._run_command("clippy", args)

    def run_all(self) -> List[CheckResult]:
        """Run all backend checks."""
        results = []

        self.console.print(f"\n[bold yellow]Backend[/bold yellow] ({self.stack.path})")
        self.console.print(f"  Language: {self.stack.language}")
        if self.packages:
            self.console.print(f"  [dim]Packages: {', '.join(self.packages)}[/dim]")
        elif self.stack.has_workspace:
            self.console.print("  [dim]Workspace detected[/dim]")

        # Format
        self.console.print("  [dim]Checking format...[/dim]", end="")
        result = self.check_format()
        results.append(result)
        self._print_result(result)

        # Compile
        self.console.print("  [dim]Checking compilation...[/dim]", end="")
        result = self.check_compile()
        results.append(result)
        self._print_result(result)

        # Clippy
        self.console.print("  [dim]Running clippy...[/dim]", end="")
        result = self.check_clippy()
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
                # Show last 10 lines of output for errors
                lines = result.output.split("\n")
                for line in lines[-10:]:
                    self.console.print(f"    [dim]{line}[/dim]")
