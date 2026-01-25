"""Configuration loader for vibe-check."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

try:
    import tomllib  # Python 3.11+
except ImportError:
    import tomli as tomllib  # Fallback for Python 3.9-3.10


CONFIG_FILENAME = ".vibe-check.toml"


@dataclass
class CommandConfig:
    """A single command configuration."""
    name: str
    cmd: str
    path: str = "."
    fix_cmd: Optional[str] = None  # Alternative command when --fix is used
    timeout: int = 300  # 5 minutes default


@dataclass
class QualityConfig:
    """Quality check configuration."""
    commands: List[CommandConfig] = field(default_factory=list)


@dataclass
class SecurityConfig:
    """Security check configuration."""
    commands: List[CommandConfig] = field(default_factory=list)
    secrets_scan: bool = True
    secrets_patterns: List[str] = field(default_factory=list)
    skip_patterns: List[str] = field(default_factory=list)


@dataclass
class TestConfig:
    """Test configuration."""
    commands: List[CommandConfig] = field(default_factory=list)


@dataclass
class ReviewConfig:
    """Review configuration."""
    base_branch: str = "main"


@dataclass
class VibeCheckConfig:
    """Complete vibe-check configuration."""
    name: str = ""
    root: Path = field(default_factory=lambda: Path("."))
    quality: QualityConfig = field(default_factory=QualityConfig)
    security: SecurityConfig = field(default_factory=SecurityConfig)
    test: TestConfig = field(default_factory=TestConfig)
    review: ReviewConfig = field(default_factory=ReviewConfig)

    @property
    def is_custom(self) -> bool:
        """Check if this is a custom config (vs auto-detected)."""
        return bool(self.name)


def _parse_command(cmd_dict: Dict) -> CommandConfig:
    """Parse a command dictionary into CommandConfig."""
    return CommandConfig(
        name=cmd_dict.get("name", "unnamed"),
        cmd=cmd_dict["cmd"],
        path=cmd_dict.get("path", "."),
        fix_cmd=cmd_dict.get("fix_cmd"),
        timeout=cmd_dict.get("timeout", 300),
    )


def _parse_commands(commands_list: List[Dict]) -> List[CommandConfig]:
    """Parse a list of command dictionaries."""
    return [_parse_command(cmd) for cmd in commands_list]


def load_config(root: Path) -> Optional[VibeCheckConfig]:
    """Load configuration from .vibe-check.toml if it exists.

    Args:
        root: Project root directory

    Returns:
        VibeCheckConfig if config file exists, None otherwise
    """
    config_path = root / CONFIG_FILENAME

    if not config_path.exists():
        return None

    try:
        with open(config_path, "rb") as f:
            data = tomllib.load(f)
    except Exception as e:
        raise ValueError(f"Failed to parse {CONFIG_FILENAME}: {e}")

    # Parse project section
    project = data.get("project", {})
    name = project.get("name", "")

    # Parse quality section
    quality_data = data.get("quality", {})
    quality = QualityConfig(
        commands=_parse_commands(quality_data.get("commands", []))
    )

    # Parse security section
    security_data = data.get("security", {})
    security = SecurityConfig(
        commands=_parse_commands(security_data.get("commands", [])),
        secrets_scan=security_data.get("secrets_scan", True),
        secrets_patterns=security_data.get("secrets_patterns", []),
        skip_patterns=security_data.get("skip_patterns", []),
    )

    # Parse test section
    test_data = data.get("test", {})
    test = TestConfig(
        commands=_parse_commands(test_data.get("commands", []))
    )

    # Parse review section
    review_data = data.get("review", {})
    review = ReviewConfig(
        base_branch=review_data.get("base_branch", "main")
    )

    return VibeCheckConfig(
        name=name,
        root=root,
        quality=quality,
        security=security,
        test=test,
        review=review,
    )


def get_default_rust_react_config() -> VibeCheckConfig:
    """Get default configuration for Rust + React/TypeScript stack."""
    return VibeCheckConfig(
        name="rust-react",
        quality=QualityConfig(
            commands=[
                CommandConfig(name="lint", cmd="pnpm lint", path="vibe-frontend", fix_cmd="pnpm lint --fix"),
                CommandConfig(name="typecheck", cmd="pnpm check", path="vibe-frontend"),
                CommandConfig(name="format-fe", cmd="pnpm format --check", path="vibe-frontend", fix_cmd="pnpm format"),
                CommandConfig(name="format-be", cmd="cargo fmt --all --check", path="vibe-backend", fix_cmd="cargo fmt --all"),
                CommandConfig(name="compile", cmd="cargo check --workspace", path="vibe-backend", timeout=600),
                CommandConfig(name="clippy", cmd="cargo clippy --workspace -- -D warnings", path="vibe-backend",
                            fix_cmd="cargo clippy --workspace --fix --allow-dirty -- -D warnings", timeout=600),
            ]
        ),
        security=SecurityConfig(
            commands=[
                CommandConfig(name="npm-audit", cmd="pnpm audit --audit-level=high", path="vibe-frontend"),
                CommandConfig(name="cargo-audit", cmd="cargo audit", path="vibe-backend"),
            ],
            secrets_scan=True,
        ),
        test=TestConfig(
            commands=[
                CommandConfig(name="e2e", cmd="npx playwright test", path="vibe-testing", timeout=600),
            ]
        ),
    )


# Preset configurations for common stacks
PRESETS: Dict[str, VibeCheckConfig] = {
    "rust-react": get_default_rust_react_config(),
}


def get_preset(name: str) -> Optional[VibeCheckConfig]:
    """Get a preset configuration by name."""
    return PRESETS.get(name)
