.PHONY: help dev build build-production frontend-dev frontend-build test clean

WAILS := go run github.com/wailsapp/wails/v2/cmd/wails
FRONTEND := cd frontend && pnpm

help:
	@echo "conflicto — available commands:"
	@echo "  make dev               Run Wails dev mode (live-reload backend + frontend)"
	@echo "  make build             Build a local debug binary"
	@echo "  make build-production  Build a production binary"
	@echo "  make frontend-dev      Run frontend dev server only (Vite)"
	@echo "  make frontend-build    Build frontend assets for production"
	@echo "  make test              Run Go tests"
	@echo "  make clean             Remove build artifacts"

dev:
	$(WAILS) dev

build:
	$(WAILS) build

build-production:
	$(WAILS) build -ldflags="-w -s" -trimpath

frontend-dev:
	$(FRONTEND) dev

frontend-build:
	$(FRONTEND) build

test:
	go test -v ./...

clean:
	rm -rf build/bin
	rm -rf frontend/dist
