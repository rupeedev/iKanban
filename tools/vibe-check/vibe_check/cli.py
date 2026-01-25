"""vibe-check CLI entry point."""

import subprocess
import sys
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax

from . import __version__
from .detectors import detect_stack
from .checkers import FrontendChecker, BackendChecker, SecurityChecker


console = Console()


@click.group(invoke_without_command=True)
@click.option(
    "--path", "-p",
    type=click.Path(exists=True, path_type=Path),
    default=".",
    help="Project root path (default: current directory)",
)
@click.option(
    "--verbose", "-v",
    is_flag=True,
    help="Verbose output",
)
@click.version_option(version=__version__)
@click.pass_context
def main(ctx, path: Path, verbose: bool):
    """Quality checker for full-stack projects.

    Auto-detects your stack (Rust + TypeScript/React) and runs
    quality, security, and review checks.

    \b
    Commands:
        vibe-check              Run all checks (quality + security)
        vibe-check quality      Run quality checks only (lint, format, compile)
        vibe-check security     Run security checks only (audit, secrets)
        vibe-check review       Show git diff for code review

    \b
    Examples:
        vibe-check                  # All checks
        vibe-check quality --fix    # Quality with auto-fix
        vibe-check security         # Security only
        vibe-check review           # Show diff
    """
    ctx.ensure_object(dict)
    ctx.obj["path"] = Path(path).resolve()
    ctx.obj["verbose"] = verbose

    # If no subcommand, run all checks
    if ctx.invoked_subcommand is None:
        ctx.invoke(all_checks)


@main.command("quality")
@click.option("--frontend/--no-frontend", "-f/-F", default=None)
@click.option("--backend/--no-backend", "-b/-B", default=None)
@click.option("--fix", is_flag=True, help="Auto-fix issues where possible")
@click.pass_context
def quality_checks(ctx, frontend: Optional[bool], backend: Optional[bool], fix: bool):
    """Run quality checks (lint, format, compile, clippy)."""
    path = ctx.obj["path"]
    verbose = ctx.obj["verbose"]

    console.print(Panel.fit(
        "[bold]vibe-check quality[/bold]",
        subtitle="Lint, format, type-check",
    ))

    stack = detect_stack(path)
    all_results = []

    run_frontend = frontend is not False and stack.frontend is not None
    run_backend = backend is not False and stack.backend is not None

    if not run_frontend and not run_backend:
        console.print("[yellow]No supported stack detected[/yellow]")
        sys.exit(2)

    if run_frontend and stack.frontend:
        checker = FrontendChecker(stack.frontend, fix=fix, verbose=verbose)
        all_results.extend(checker.run_all())

    if run_backend and stack.backend:
        checker = BackendChecker(stack.backend, fix=fix, verbose=verbose)
        all_results.extend(checker.run_all())

    _print_summary(all_results)


@main.command("security")
@click.pass_context
def security_checks(ctx):
    """Run security checks (audit dependencies, scan for secrets)."""
    path = ctx.obj["path"]
    verbose = ctx.obj["verbose"]

    console.print(Panel.fit(
        "[bold]vibe-check security[/bold]",
        subtitle="Audit & secrets scan",
    ))

    stack = detect_stack(path)
    checker = SecurityChecker(
        root=path,
        frontend=stack.frontend,
        backend=stack.backend,
        verbose=verbose,
    )
    results = checker.run_all()
    _print_summary(results)


@main.command("review")
@click.option("--base", "-b", default="main", help="Base branch to compare against")
@click.pass_context
def review_checks(ctx, base: str):
    """Show git diff for code review."""
    path = ctx.obj["path"]

    console.print(Panel.fit(
        "[bold]vibe-check review[/bold]",
        subtitle=f"Diff against {base}",
    ))

    try:
        # Get diff stats
        result = subprocess.run(
            ["git", "diff", "--stat", base],
            cwd=path,
            capture_output=True,
            text=True,
        )
        if result.stdout.strip():
            console.print("\n[bold]Changed files:[/bold]")
            console.print(result.stdout)

        # Get full diff
        result = subprocess.run(
            ["git", "diff", base],
            cwd=path,
            capture_output=True,
            text=True,
        )
        if result.stdout.strip():
            console.print("\n[bold]Diff:[/bold]")
            syntax = Syntax(result.stdout[:5000], "diff", theme="monokai", line_numbers=True)
            console.print(syntax)
            if len(result.stdout) > 5000:
                console.print(f"\n[dim]... truncated ({len(result.stdout)} chars total)[/dim]")
        else:
            console.print("[green]No changes from {base}[/green]")

    except FileNotFoundError:
        console.print("[red]Error: git not found[/red]")
        sys.exit(2)


@main.command("all")
@click.option("--fix", is_flag=True, help="Auto-fix issues where possible")
@click.pass_context
def all_checks(ctx, fix: bool = False):
    """Run all checks (quality + security)."""
    path = ctx.obj["path"]
    verbose = ctx.obj["verbose"]

    console.print(Panel.fit(
        f"[bold]vibe-check[/bold] v{__version__}",
        subtitle="Full quality & security scan",
    ))

    stack = detect_stack(path)
    all_results = []

    # Quality checks
    if stack.frontend:
        checker = FrontendChecker(stack.frontend, fix=fix, verbose=verbose)
        all_results.extend(checker.run_all())

    if stack.backend:
        checker = BackendChecker(stack.backend, fix=fix, verbose=verbose)
        all_results.extend(checker.run_all())

    # Security checks
    security = SecurityChecker(
        root=path,
        frontend=stack.frontend,
        backend=stack.backend,
        verbose=verbose,
    )
    all_results.extend(security.run_all())

    _print_summary(all_results)


def _print_summary(results):
    """Print check summary and exit with appropriate code."""
    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    total = len(results)

    console.print("\n" + "─" * 40)

    if failed == 0:
        console.print(f"[bold green]✓ All {total} checks passed![/bold green]")
        sys.exit(0)
    else:
        console.print(f"[bold red]✗ {failed}/{total} checks failed[/bold red]")
        console.print("\n[red]Failed:[/red]")
        for r in results:
            if not r.passed:
                console.print(f"  • {r.name}")
        sys.exit(1)


if __name__ == "__main__":
    main()
