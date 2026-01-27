"""Stack detection for vibe-check."""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class FrontendStack:
    """Detected frontend stack."""
    path: Path
    package_manager: str  # pnpm, npm, yarn
    has_typescript: bool
    has_eslint: bool


@dataclass
class BackendStack:
    """Detected backend stack."""
    path: Path
    language: str  # rust
    has_workspace: bool


@dataclass
class ProjectStack:
    """Complete project stack detection result."""
    root: Path
    frontend: Optional[FrontendStack]
    backend: Optional[BackendStack]


def detect_package_manager(path: Path) -> Optional[str]:
    """Detect the package manager used in a directory."""
    if (path / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (path / "yarn.lock").exists():
        return "yarn"
    if (path / "package-lock.json").exists():
        return "npm"
    if (path / "package.json").exists():
        return "npm"  # Default to npm if package.json exists
    return None


def detect_frontend(root: Path) -> Optional[FrontendStack]:
    """Detect frontend stack in project."""
    # Common frontend directory names
    frontend_dirs = ["frontend", "vibe-frontend", "web", "client", "app"]

    # Check root first
    candidates = [root] + [root / d for d in frontend_dirs]

    for path in candidates:
        if not path.exists():
            continue

        pkg_manager = detect_package_manager(path)
        if pkg_manager:
            package_json = path / "package.json"
            has_typescript = (path / "tsconfig.json").exists()
            has_eslint = (
                (path / ".eslintrc.js").exists() or
                (path / ".eslintrc.json").exists() or
                (path / ".eslintrc.cjs").exists() or
                (path / "eslint.config.js").exists()
            )

            # Also check package.json for eslint
            if package_json.exists() and not has_eslint:
                try:
                    import json
                    with open(package_json) as f:
                        pkg = json.load(f)
                    has_eslint = "eslint" in pkg.get("devDependencies", {})
                except Exception:
                    pass

            return FrontendStack(
                path=path,
                package_manager=pkg_manager,
                has_typescript=has_typescript,
                has_eslint=has_eslint,
            )

    return None


def detect_backend(root: Path) -> Optional[BackendStack]:
    """Detect backend stack in project."""
    # Common backend directory names
    backend_dirs = ["backend", "vibe-backend", "server", "api", "crates"]

    # Check root first
    candidates = [root] + [root / d for d in backend_dirs]

    for path in candidates:
        if not path.exists():
            continue

        cargo_toml = path / "Cargo.toml"
        if cargo_toml.exists():
            # Check if it's a workspace
            has_workspace = False
            try:
                content = cargo_toml.read_text()
                has_workspace = "[workspace]" in content
            except Exception:
                pass

            return BackendStack(
                path=path,
                language="rust",
                has_workspace=has_workspace,
            )

    return None


def detect_stack(root: Path) -> ProjectStack:
    """Detect the complete project stack."""
    root = root.resolve()

    return ProjectStack(
        root=root,
        frontend=detect_frontend(root),
        backend=detect_backend(root),
    )
