"""Generic checker that runs configured commands."""

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List

from rich.console import Console

from ..config import CommandConfig


@dataclass
class CheckResult:
    """Result of a single check."""
    name: str
    passed: bool
    output: str
    command: str


class GenericChecker:
    """Generic checker that runs configured commands."""

    def __init__(
        self,
        root: Path,
        commands: List[CommandConfig],
        fix: bool = False,
        verbose: bool = False,
        category: str = "Checks",
        color: str = "blue",
    ):
        self.root = root
        self.commands = commands
        self.fix = fix
        self.verbose = verbose
        self.category = category
        self.color = color
        self.console = Console()

    def _run_command(self, config: CommandConfig) -> CheckResult:
        """Run a single command and return the result."""
        # Use fix_cmd if available and --fix was requested
        cmd_str = config.fix_cmd if (self.fix and config.fix_cmd) else config.cmd

        # Resolve working directory
        cwd = self.root / config.path if config.path != "." else self.root

        if not cwd.exists():
            return CheckResult(
                name=config.name,
                passed=False,
                output=f"Directory not found: {cwd}",
                command=cmd_str,
            )

        if self.verbose:
            self.console.print(f"  [dim]Running: {cmd_str} (in {config.path})[/dim]")

        try:
            result = subprocess.run(
                cmd_str,
                shell=True,  # Use shell to support complex commands
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=config.timeout,
            )
            passed = result.returncode == 0
            output = result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            passed = False
            output = f"Command timed out after {config.timeout} seconds"
        except Exception as e:
            passed = False
            output = f"Error running command: {e}"

        return CheckResult(
            name=config.name,
            passed=passed,
            output=output.strip(),
            command=cmd_str,
        )

    def run_all(self) -> List[CheckResult]:
        """Run all configured commands."""
        results = []

        if not self.commands:
            return results

        self.console.print(f"\n[bold {self.color}]{self.category}[/bold {self.color}]")

        for config in self.commands:
            self.console.print(f"  [dim]{config.name}...[/dim]", end="")
            result = self._run_command(config)
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
                lines = result.output.split("\n")
                for line in lines[-10:]:
                    self.console.print(f"    [dim]{line}[/dim]")
