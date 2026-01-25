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
from .config import load_config, VibeCheckConfig
from .detectors import detect_stack
from .checkers import FrontendChecker, BackendChecker, SecurityChecker, GenericChecker


console = Console()


def get_config_or_detect(path: Path, verbose: bool) -> tuple[Optional[VibeCheckConfig], bool]:
    """Load config file or fall back to auto-detection.

    Returns:
        Tuple of (config, is_custom) where is_custom is True if config was loaded
    """
    config = load_config(path)
    if config:
        if verbose:
            console.print(f"[dim]Loaded config: {path / '.vibe-check.toml'}[/dim]")
        return config, True
    return None, False


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
@click.option(
    "--config", "-c",
    type=click.Path(exists=True, path_type=Path),
    default=None,
    help="Path to config file (default: .vibe-check.toml in project root)",
)
@click.version_option(version=__version__)
@click.pass_context
def main(ctx, path: Path, verbose: bool, config: Optional[Path]):
    """Quality checker for full-stack projects.

    Supports any stack via .vibe-check.toml configuration file.
    Auto-detects Rust + TypeScript/React when no config is present.

    \b
    Commands:
        vibe-check              Run all checks (quality + security)
        vibe-check quality      Run quality checks only (lint, format, compile)
        vibe-check security     Run security checks only (audit, secrets)
        vibe-check review       Show git diff for code review
        vibe-check test         Run configured tests
        vibe-check init         Generate a .vibe-check.toml template

    \b
    Examples:
        vibe-check                  # All checks
        vibe-check quality --fix    # Quality with auto-fix
        vibe-check security         # Security only
        vibe-check review           # Show diff
        vibe-check init             # Create config file
    """
    ctx.ensure_object(dict)
    ctx.obj["path"] = Path(path).resolve()
    ctx.obj["verbose"] = verbose
    ctx.obj["config_path"] = config

    # If no subcommand, run all checks
    if ctx.invoked_subcommand is None:
        ctx.invoke(all_checks)


@main.command("quality")
@click.option("--frontend/--no-frontend", "-f/-F", default=None)
@click.option("--backend/--no-backend", "-b/-B", default=None)
@click.option("--fix", is_flag=True, help="Auto-fix issues where possible")
@click.option(
    "--package", "-P",
    multiple=True,
    help="Cargo package(s) to check (faster than full workspace). Requires --no-config.",
)
@click.option(
    "--no-config",
    is_flag=True,
    help="Ignore .vibe-check.toml and use auto-detection (required for --package).",
)
@click.pass_context
def quality_checks(ctx, frontend: Optional[bool], backend: Optional[bool], fix: bool, package: tuple, no_config: bool):
    """Run quality checks (lint, format, compile, clippy).

    \b
    Examples:
        vibe-check quality                                # Use config or auto-detect
        vibe-check quality --no-config -P remote          # Check only 'remote' package (~2 min)
        vibe-check quality --no-config -P remote -P db    # Check multiple packages
        vibe-check quality --no-config --fix -P remote    # Auto-fix 'remote' package
    """
    path = ctx.obj["path"]
    verbose = ctx.obj["verbose"]
    packages = list(package)  # Convert tuple to list

    console.print(Panel.fit(
        "[bold]vibe-check quality[/bold]",
        subtitle="Lint, format, type-check",
    ))

    all_results = []

    # Try config first (unless --no-config is specified)
    if no_config:
        config, is_custom = None, False
    else:
        config, is_custom = get_config_or_detect(path, verbose)

    if is_custom and config and config.quality.commands:
        # Use config-based checker
        checker = GenericChecker(
            root=path,
            commands=config.quality.commands,
            fix=fix,
            verbose=verbose,
            category="Quality",
            color="blue",
        )
        all_results.extend(checker.run_all())
    else:
        # Fall back to auto-detection
        stack = detect_stack(path)

        run_frontend = frontend is not False and stack.frontend is not None
        run_backend = backend is not False and stack.backend is not None

        if not run_frontend and not run_backend:
            console.print("[yellow]No supported stack detected. Create .vibe-check.toml to configure.[/yellow]")
            console.print("[dim]Run 'vibe-check init' to generate a template.[/dim]")
            sys.exit(2)

        if run_frontend and stack.frontend:
            checker = FrontendChecker(stack.frontend, fix=fix, verbose=verbose)
            all_results.extend(checker.run_all())

        if run_backend and stack.backend:
            checker = BackendChecker(stack.backend, fix=fix, verbose=verbose, packages=packages)
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

    all_results = []

    # Try config first
    config, is_custom = get_config_or_detect(path, verbose)

    if is_custom and config and config.security.commands:
        # Use config-based checker for audit commands
        checker = GenericChecker(
            root=path,
            commands=config.security.commands,
            fix=False,
            verbose=verbose,
            category="Security Audit",
            color="magenta",
        )
        all_results.extend(checker.run_all())

    # Always run secrets scan (uses config patterns if available)
    stack = detect_stack(path)
    security = SecurityChecker(
        root=path,
        frontend=stack.frontend,
        backend=stack.backend,
        verbose=verbose,
    )

    if not is_custom:
        # Run full security checks with auto-detection
        all_results.extend(security.run_all())
    else:
        # Only run secrets scan (audit was handled by config)
        if config and config.security.secrets_scan:
            console.print(f"\n[bold magenta]Secrets Scan[/bold magenta]")
            console.print("  [dim]Scanning for secrets...[/dim]", end="")
            result = security.check_secrets()
            all_results.append(result)
            if result.passed:
                console.print(f" [green]✓[/green] {result.name}")
            else:
                console.print(f" [red]✗[/red] {result.name}")

    _print_summary(all_results)


@main.command("test")
@click.pass_context
def test_checks(ctx):
    """Run configured tests."""
    path = ctx.obj["path"]
    verbose = ctx.obj["verbose"]

    console.print(Panel.fit(
        "[bold]vibe-check test[/bold]",
        subtitle="Run tests",
    ))

    # Try config first
    config, is_custom = get_config_or_detect(path, verbose)

    if is_custom and config and config.test.commands:
        checker = GenericChecker(
            root=path,
            commands=config.test.commands,
            fix=False,
            verbose=verbose,
            category="Tests",
            color="cyan",
        )
        results = checker.run_all()
        _print_summary(results)
    else:
        console.print("[yellow]No test commands configured.[/yellow]")
        console.print("[dim]Add [test] section to .vibe-check.toml or run 'vibe-check init'.[/dim]")
        sys.exit(2)


@main.command("review")
@click.option("--base", "-b", default=None, help="Base branch to compare against")
@click.pass_context
def review_checks(ctx, base: Optional[str]):
    """Show git diff for code review."""
    path = ctx.obj["path"]
    verbose = ctx.obj["verbose"]

    # Get base branch from config or default
    config, _ = get_config_or_detect(path, verbose)
    if base is None:
        base = config.review.base_branch if config else "main"

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
            console.print(f"[green]No changes from {base}[/green]")

    except FileNotFoundError:
        console.print("[red]Error: git not found[/red]")
        sys.exit(2)


@main.command("init")
@click.option("--preset", "-P", default=None, help="Use a preset (rust-react, go-react, python-vue, node)")
@click.option("--force", "-f", is_flag=True, help="Overwrite existing config")
@click.pass_context
def init_config(ctx, preset: Optional[str], force: bool):
    """Generate a .vibe-check.toml configuration template."""
    path = ctx.obj["path"]
    config_path = path / ".vibe-check.toml"

    if config_path.exists() and not force:
        console.print(f"[yellow]Config already exists: {config_path}[/yellow]")
        console.print("[dim]Use --force to overwrite.[/dim]")
        sys.exit(1)

    # Detect stack for better defaults
    stack = detect_stack(path)

    if preset == "rust-react" or (stack.backend and stack.backend.language == "rust"):
        template = _get_rust_react_template()
    elif preset == "go-react":
        template = _get_go_react_template()
    elif preset == "python-vue":
        template = _get_python_vue_template()
    elif preset == "node":
        template = _get_node_template()
    else:
        # Generic template
        template = _get_generic_template()

    config_path.write_text(template)
    console.print(f"[green]Created: {config_path}[/green]")
    console.print("[dim]Edit the file to customize commands for your project.[/dim]")


@main.command("all")
@click.option("--fix", is_flag=True, help="Auto-fix issues where possible")
@click.option(
    "--package", "-P",
    multiple=True,
    help="Cargo package(s) to check (faster than full workspace). Requires --no-config.",
)
@click.option(
    "--no-config",
    is_flag=True,
    help="Ignore .vibe-check.toml and use auto-detection (required for --package).",
)
@click.pass_context
def all_checks(ctx, fix: bool = False, package: tuple = (), no_config: bool = False):
    """Run all checks (quality + security)."""
    path = ctx.obj["path"]
    verbose = ctx.obj["verbose"]
    packages = list(package)  # Convert tuple to list

    console.print(Panel.fit(
        f"[bold]vibe-check[/bold] v{__version__}",
        subtitle="Full quality & security scan",
    ))

    all_results = []

    # Try config first (unless --no-config is specified)
    if no_config:
        config, is_custom = None, False
    else:
        config, is_custom = get_config_or_detect(path, verbose)

    if is_custom and config:
        # Config-based checks
        if config.quality.commands:
            checker = GenericChecker(
                root=path,
                commands=config.quality.commands,
                fix=fix,
                verbose=verbose,
                category="Quality",
                color="blue",
            )
            all_results.extend(checker.run_all())

        if config.security.commands:
            checker = GenericChecker(
                root=path,
                commands=config.security.commands,
                fix=False,
                verbose=verbose,
                category="Security Audit",
                color="magenta",
            )
            all_results.extend(checker.run_all())

        # Secrets scan
        if config.security.secrets_scan:
            stack = detect_stack(path)
            security = SecurityChecker(
                root=path,
                frontend=stack.frontend,
                backend=stack.backend,
                verbose=verbose,
            )
            console.print(f"\n[bold magenta]Secrets Scan[/bold magenta]")
            console.print("  [dim]Scanning for secrets...[/dim]", end="")
            result = security.check_secrets()
            all_results.append(result)
            if result.passed:
                console.print(f" [green]✓[/green] {result.name}")
            else:
                console.print(f" [red]✗[/red] {result.name}")
    else:
        # Auto-detection fallback
        stack = detect_stack(path)

        # Quality checks
        if stack.frontend:
            checker = FrontendChecker(stack.frontend, fix=fix, verbose=verbose)
            all_results.extend(checker.run_all())

        if stack.backend:
            checker = BackendChecker(stack.backend, fix=fix, verbose=verbose, packages=packages)
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


# Template generators for different stacks

def _get_rust_react_template() -> str:
    return '''# vibe-check configuration for Rust + React/TypeScript

[project]
name = "my-project"

[quality]
commands = [
  # Frontend checks
  { name = "lint", cmd = "pnpm lint", path = "vibe-frontend", fix_cmd = "pnpm lint --fix" },
  { name = "typecheck", cmd = "pnpm check", path = "vibe-frontend" },
  { name = "format-fe", cmd = "pnpm format --check", path = "vibe-frontend", fix_cmd = "pnpm format" },

  # Backend checks
  { name = "format-be", cmd = "cargo fmt --all --check", path = "vibe-backend", fix_cmd = "cargo fmt --all" },
  { name = "compile", cmd = "cargo check --workspace", path = "vibe-backend", timeout = 600 },
  { name = "clippy", cmd = "cargo clippy --workspace -- -D warnings", path = "vibe-backend", fix_cmd = "cargo clippy --workspace --fix --allow-dirty -- -D warnings", timeout = 600 },
]

[security]
commands = [
  { name = "npm-audit", cmd = "pnpm audit --audit-level=high", path = "vibe-frontend" },
  { name = "cargo-audit", cmd = "cargo audit", path = "vibe-backend" },
]
secrets_scan = true

[test]
commands = [
  { name = "e2e", cmd = "npx playwright test", path = "vibe-testing", timeout = 600 },
]

[review]
base_branch = "main"
'''


def _get_go_react_template() -> str:
    return '''# vibe-check configuration for Go + React/TypeScript

[project]
name = "my-go-react-project"

[quality]
commands = [
  # Frontend checks
  { name = "lint", cmd = "npm run lint", path = "frontend", fix_cmd = "npm run lint --fix" },
  { name = "typecheck", cmd = "npm run typecheck", path = "frontend" },
  { name = "format-fe", cmd = "npm run format:check", path = "frontend", fix_cmd = "npm run format" },

  # Backend checks
  { name = "format-be", cmd = "gofmt -l .", path = "backend" },
  { name = "vet", cmd = "go vet ./...", path = "backend" },
  { name = "build", cmd = "go build ./...", path = "backend" },
  { name = "staticcheck", cmd = "staticcheck ./...", path = "backend" },
]

[security]
commands = [
  { name = "npm-audit", cmd = "npm audit --audit-level=high", path = "frontend" },
  { name = "gosec", cmd = "gosec ./...", path = "backend" },
  { name = "govulncheck", cmd = "govulncheck ./...", path = "backend" },
]
secrets_scan = true

[test]
commands = [
  { name = "go-test", cmd = "go test ./...", path = "backend" },
  { name = "e2e", cmd = "npx playwright test", path = "tests", timeout = 600 },
]

[review]
base_branch = "main"
'''


def _get_python_vue_template() -> str:
    return '''# vibe-check configuration for Python + Vue

[project]
name = "my-python-vue-project"

[quality]
commands = [
  # Frontend checks
  { name = "lint", cmd = "npm run lint", path = "frontend", fix_cmd = "npm run lint --fix" },
  { name = "typecheck", cmd = "npm run type-check", path = "frontend" },

  # Backend checks
  { name = "ruff", cmd = "ruff check .", path = "backend", fix_cmd = "ruff check --fix ." },
  { name = "mypy", cmd = "mypy .", path = "backend" },
  { name = "format", cmd = "black --check .", path = "backend", fix_cmd = "black ." },
]

[security]
commands = [
  { name = "npm-audit", cmd = "npm audit --audit-level=high", path = "frontend" },
  { name = "pip-audit", cmd = "pip-audit", path = "backend" },
  { name = "bandit", cmd = "bandit -r .", path = "backend" },
]
secrets_scan = true

[test]
commands = [
  { name = "pytest", cmd = "pytest", path = "backend" },
  { name = "e2e", cmd = "npx playwright test", path = "tests", timeout = 600 },
]

[review]
base_branch = "main"
'''


def _get_node_template() -> str:
    return '''# vibe-check configuration for Node.js fullstack

[project]
name = "my-node-project"

[quality]
commands = [
  { name = "lint", cmd = "npm run lint", path = ".", fix_cmd = "npm run lint --fix" },
  { name = "typecheck", cmd = "npm run typecheck", path = "." },
  { name = "format", cmd = "npm run format:check", path = ".", fix_cmd = "npm run format" },
  { name = "build", cmd = "npm run build", path = "." },
]

[security]
commands = [
  { name = "npm-audit", cmd = "npm audit --audit-level=high", path = "." },
]
secrets_scan = true

[test]
commands = [
  { name = "unit", cmd = "npm test", path = "." },
  { name = "e2e", cmd = "npm run test:e2e", path = ".", timeout = 600 },
]

[review]
base_branch = "main"
'''


def _get_generic_template() -> str:
    return '''# vibe-check configuration
# Customize commands for your project stack

[project]
name = "my-project"

[quality]
# Add your lint, format, and compile commands
commands = [
  # Example: { name = "lint", cmd = "npm run lint", path = ".", fix_cmd = "npm run lint --fix" },
  # Example: { name = "build", cmd = "npm run build", path = "." },
]

[security]
# Add dependency audit commands
commands = [
  # Example: { name = "audit", cmd = "npm audit --audit-level=high", path = "." },
]
secrets_scan = true  # Scan for hardcoded secrets

[test]
# Add test commands
commands = [
  # Example: { name = "unit", cmd = "npm test", path = "." },
  # Example: { name = "e2e", cmd = "npx playwright test", path = "tests", timeout = 600 },
]

[review]
base_branch = "main"  # Base branch for git diff
'''


if __name__ == "__main__":
    main()
