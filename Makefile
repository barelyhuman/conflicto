.PHONY: help icon dev build build-production frontend-dev frontend-build test clean

WAILS := go run github.com/wailsapp/wails/v2/cmd/wails
FRONTEND := cd frontend && pnpm
APP_ICON := resources/app-icon/conflicto.png
WAILS_ICON := build/appicon.png

help:
	@echo "conflicto — available commands:"
	@echo "  make icon              Sync app icon into build/appicon.png for Wails"
	@echo "  make dev               Run Wails dev mode (live-reload backend + frontend)"
	@echo "  make build             Build a local debug binary"
	@echo "  make build-production  Build a production binary"
	@echo "  make frontend-dev      Run frontend dev server only (Vite)"
	@echo "  make frontend-build    Build frontend assets for production"
	@echo "  make test              Run Go tests"
	@echo "  make clean             Remove build artifacts"

icon:
	@mkdir -p build
	cp "$(APP_ICON)" "$(WAILS_ICON)"

dev: icon
	$(WAILS) dev

build: icon
	$(WAILS) build

build-production: icon
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
