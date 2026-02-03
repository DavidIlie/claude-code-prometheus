"use client";

import type { ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Monitor,
  FileText,
  Settings,
  LogOut,
  Terminal,
  Activity,
  Menu,
  X,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "~/app/lib/utils";

interface LayoutProps {
  children: ReactNode;
  title: string;
  actions?: ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Devices", href: "/devices", icon: Monitor },
  { name: "Sessions", href: "/sessions", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
];

// Current version - should match version.txt
export const APP_VERSION = "1.0.0";

// Environment variable for footer promo
const DISABLE_FOOTER_PROMO = typeof window !== "undefined"
  ? (window as unknown as { __ENV__?: { DISABLE_FOOTER_PROMO?: string } }).__ENV__?.DISABLE_FOOTER_PROMO === "true"
  : process.env.DISABLE_FOOTER_PROMO === "true";

export function Layout({ children, title, actions }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [versionStatus, setVersionStatus] = useState<{
    current: string;
    latest: string | null;
    isOutdated: boolean;
    error: boolean;
  }>({
    current: APP_VERSION,
    latest: null,
    isOutdated: false,
    error: false,
  });
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const navigate = useNavigate();

  const handleLogout = () => {
    // Clear the auth-token cookie
    document.cookie = "auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=strict";
    // Navigate to login
    navigate({ to: "/login" });
  };

  // Check for version updates
  useEffect(() => {
    async function checkVersion() {
      try {
        const response = await fetch(
          "https://raw.githubusercontent.com/DavidIlie/claude-code-prometheus/main/apps/server/version.txt"
        );
        if (!response.ok) {
          // Fail silently in development or if fetch fails
          setVersionStatus((prev) => ({ ...prev, error: true }));
          return;
        }
        const latestVersion = (await response.text()).trim();
        const isOutdated = latestVersion !== APP_VERSION;
        setVersionStatus({
          current: APP_VERSION,
          latest: latestVersion,
          isOutdated,
          error: false,
        });
      } catch {
        // Fail silently - this is expected in development
        setVersionStatus((prev) => ({ ...prev, error: true }));
      }
    }
    checkVersion();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1">
        {/* Mobile menu backdrop */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-card transition-transform duration-300 lg:relative lg:translate-x-0",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-full flex-col">
            {/* Logo */}
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <Link to="/" className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Terminal className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="font-semibold tracking-tight">Claude</span>
                  <span className="ml-1 text-muted-foreground">Tracker</span>
                </div>
              </Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary lg:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Status indicator */}
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <div className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </div>
                <span className="text-muted-foreground">System Online</span>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 p-3">
              <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Navigation
              </div>
              {navigation.map((item) => {
                const isActive = currentPath === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn("nav-item", isActive && "active")}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Sidebar Footer */}
            <div className="border-t border-border p-3">
              <button
                onClick={handleLogout}
                className="nav-item w-full text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {actions}
              <div
                className={cn(
                  "hidden items-center gap-2 rounded-lg border px-3 py-1.5 text-sm lg:flex",
                  versionStatus.isOutdated
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                <Activity
                  className={cn(
                    "h-3.5 w-3.5",
                    versionStatus.isOutdated ? "text-amber-400" : "text-primary"
                  )}
                />
                <span className="font-mono text-xs">v{APP_VERSION}</span>
                {versionStatus.isOutdated && (
                  <span className="text-xs">(update available)</span>
                )}
              </div>
            </div>
          </header>

          {/* Version update banner */}
          {versionStatus.isOutdated && versionStatus.latest && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 lg:px-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-amber-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    A new version is available: <strong>v{versionStatus.latest}</strong>
                  </span>
                </div>
                <a
                  href="https://github.com/DavidIlie/claude-code-prometheus"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300"
                >
                  <span>Update</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Page content */}
          <div className="flex-1 overflow-auto p-4 lg:p-6">{children}</div>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 px-4 py-3 lg:px-6">
        <div className="flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-1">
            <span>Claude Code Usage Tracker</span>
            <span className="text-border">|</span>
            <span className="font-mono">v{APP_VERSION}</span>
          </div>
          {!DISABLE_FOOTER_PROMO && (
            <div className="flex items-center gap-1">
              <span>Made by</span>
              <a
                href="https://github.com/DavidIlie"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:text-primary/80 transition-colors"
              >
                David Ilie
              </a>
              <span className="text-border">|</span>
              <a
                href="https://github.com/DavidIlie/claude-code-prometheus"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>GitHub</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
