.PHONY: help icon dev build build-production frontend-dev frontend-build frontend-test test clean

WAILS := go run github.com/wailsapp/wails/v2/cmd/wails
FRONTEND := cd frontend && pnpm
APP_ICON := resources/app-icon/conflicto.png
WAILS_ICON := build/appicon.png

# Detect OS and define platform-agnostic commands
ifeq ($(OS),Windows_NT)
	MKDIR = if not exist $(subst /,\,$(1)) mkdir $(subst /,\,$(1))
	COPY = copy /Y $(subst /,\,$(1)) $(subst /,\,$(2))
	RM = if exist $(subst /,\,$(1)) rmdir /s /q $(subst /,\,$(1))
else
	MKDIR = mkdir -p $(1)
	COPY = cp $(1) $(2)
	RM = rm -rf $(1)
endif

help:
	@echo "conflicto — available commands:"
	@echo "  make icon              Sync app icon into build/appicon.png for Wails"
	@echo "  make dev               Run Wails dev mode (live-reload backend + frontend)"
	@echo "  make build             Build a local debug binary"
	@echo "  make build-production  Build a production binary"
	@echo "  make frontend-dev      Run frontend dev server only (Vite)"
	@echo "  make frontend-build    Build frontend assets for production"
	@echo "  make frontend-test     Run frontend unit tests (Vitest)"
	@echo "  make test              Run Go + frontend tests"
	@echo "  make clean             Remove build artifacts"

icon:
	$(call MKDIR,build)
	$(call COPY,$(APP_ICON),$(WAILS_ICON))

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

frontend-test:
	$(FRONTEND) test

test: frontend-test frontend-build
	go test -v ./...

clean:
	$(call RM,build/bin)
	$(call RM,frontend/dist)