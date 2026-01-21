# iKanban Project Makefile
# Usage: make <target>

.PHONY: help dev backend frontend test lint check clean clean-all sweep sqlx docker-build docker-push

# Default target
help:
	@echo "iKanban Development Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Run backend and frontend (requires 2 terminals)"
	@echo "  make backend      - Run backend server"
	@echo "  make frontend     - Run frontend dev server"
	@echo ""
	@echo "Quality:"
	@echo "  make lint         - Run all linters"
	@echo "  make lint-fe      - Lint frontend only"
	@echo "  make lint-be      - Check backend only"
	@echo "  make check        - Type check frontend"
	@echo "  make test         - Run all tests"
	@echo "  make test-fe      - Run frontend tests"
	@echo "  make test-be      - Run backend tests"
	@echo "  make test-e2e     - Run Playwright E2E tests"
	@echo ""
	@echo "Database:"
	@echo "  make sqlx         - Regenerate SQLx cache"
	@echo "  make migrate      - Run database migrations"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean        - Clean build artifacts (keeps deps)"
	@echo "  make clean-all    - Full clean (cargo clean)"
	@echo "  make sweep        - Remove artifacts older than 14 days"
	@echo "  make sweep-install - Install cargo-sweep"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-push  - Push to Docker Hub"

# ============================================================================
# Development
# ============================================================================

dev:
	@echo "Run in separate terminals:"
	@echo "  Terminal 1: make backend"
	@echo "  Terminal 2: make frontend"

backend:
	cd vibe-backend && cargo run --bin server

frontend:
	cd vibe-frontend && pnpm dev

# ============================================================================
# Quality Checks
# ============================================================================

lint: lint-be lint-fe
	@echo "✓ All lints passed"

lint-fe:
	cd vibe-frontend && pnpm lint

lint-be:
	cd vibe-backend && cargo check --all-targets
	cd vibe-backend && cargo clippy --all-targets -- -D warnings

check:
	cd vibe-frontend && pnpm check

# ============================================================================
# Testing
# ============================================================================

test: test-be test-fe
	@echo "✓ All tests passed"

test-fe:
	cd vibe-frontend && pnpm test

test-be:
	cd vibe-backend && cargo test

test-e2e:
	cd vibe-testing && pnpm test

# ============================================================================
# Database
# ============================================================================

sqlx:
	cd vibe-backend/crates/db && cargo sqlx prepare

migrate:
	cd vibe-backend && cargo run --bin migrate

# ============================================================================
# Cleanup
# ============================================================================

# Clean incremental compilation cache only (fast rebuilds still possible)
clean:
	rm -rf vibe-backend/target/debug/incremental
	rm -rf vibe-backend/target/release/incremental
	@echo "✓ Cleaned incremental cache"

# Full clean - removes everything (next build will be slow)
clean-all:
	cd vibe-backend && cargo clean
	cd vibe-frontend && rm -rf node_modules/.cache
	@echo "✓ Full clean complete"

# Clean artifacts older than 14 days (requires cargo-sweep)
sweep:
	@command -v cargo-sweep >/dev/null 2>&1 || { echo "Run 'make sweep-install' first"; exit 1; }
	cd vibe-backend && cargo sweep --time 14
	@echo "✓ Swept old artifacts"

sweep-install:
	cargo install cargo-sweep
	@echo "✓ cargo-sweep installed"

# ============================================================================
# Docker
# ============================================================================

docker-build:
	cd vibe-backend && docker build -t ikanban-backend .

docker-push:
	docker tag ikanban-backend rupeshpanwar/ikanban-backend:latest
	docker push rupeshpanwar/ikanban-backend:latest

# ============================================================================
# Utilities
# ============================================================================

# Show disk usage
disk:
	@echo "Project disk usage:"
	@du -sh . 2>/dev/null
	@echo ""
	@echo "Largest directories:"
	@du -sh */ 2>/dev/null | sort -hr | head -5
	@echo ""
	@echo "Backend target breakdown:"
	@du -sh vibe-backend/target/*/ 2>/dev/null | sort -hr | head -5 || echo "  (no target directory)"

# Install all dependencies
install:
	cd vibe-frontend && pnpm install
	cd vibe-backend && cargo build
	@echo "✓ Dependencies installed"
