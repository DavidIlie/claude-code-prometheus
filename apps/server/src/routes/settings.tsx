"use client";

import { useState, useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Save,
  Server,
  Database,
  Activity,
  Shield,
  Trash2,
  AlertTriangle,
  Clock,
  HardDrive,
  Layers,
  FileText,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Cpu,
  MemoryStick,
  Wifi,
  WifiOff,
  RefreshCw,
  Terminal,
  Filter,
  ChevronDown,
  Info,
  AlertCircle,
  Bug,
  Zap,
} from "lucide-react";
import { Button } from "~/app/components/ui/button";
import { Input } from "~/app/components/ui/input";
import { Label } from "~/app/components/ui/label";
import { Skeleton } from "~/app/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/app/components/ui/card";
import { Layout } from "~/app/components/layout";
import { useTRPC } from "~/trpc/react";
import { cn, formatNumber } from "~/app/lib/utils";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

// Helper functions
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatLogTime(timestamp: Date | string): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function SettingsPage() {
  const navigate = useNavigate();
  const api = useTRPC();
  const queryClient = useQueryClient();

  // Check authentication
  const { data: session, isLoading: sessionLoading, error: sessionError } = useQuery({
    ...api.auth.getSession.queryOptions(),
    retry: false,
  });

  useEffect(() => {
    if (!sessionLoading && sessionError) {
      navigate({ to: "/login" });
    }
  }, [sessionLoading, sessionError, navigate]);

  const { data: settings, isLoading } = useQuery({
    ...api.settings.get.queryOptions(),
    enabled: !!session,
  });
  const { data: dbStats } = useQuery({
    ...api.settings.getDatabaseStats.queryOptions(),
    enabled: !!session,
  });
  const { data: systemStatus, refetch: refetchStatus } = useQuery({
    ...api.system.getStatus.queryOptions(),
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!session,
  });

  // Logs state
  const [logLevel, setLogLevel] = useState<"info" | "warn" | "error" | "debug" | undefined>(undefined);
  const [logCategory, setLogCategory] = useState<string | undefined>(undefined);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const { data: logsData, refetch: refetchLogs } = useQuery({
    ...api.system.getLogs.queryOptions({
      level: logLevel,
      category: logCategory,
      limit: logsExpanded ? 200 : 50,
    }),
    refetchInterval: 5000, // Refresh logs every 5 seconds
    enabled: !!session,
  });

  const clearLogsMutation = useMutation(
    api.system.clearLogs.mutationOptions({
      onSuccess: () => {
        refetchLogs();
      },
    })
  );

  const [formData, setFormData] = useState<{
    serverName?: string;
    serverUrl?: string;
    timezone?: string;
    currency?: "USD" | "EUR" | "GBP";
    enablePrometheus?: boolean;
    prometheusPort?: number;
    retentionDays?: number;
    autoUpdatePricing?: boolean;
  }>({});

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [saveSuccess, setSaveSuccess] = useState(false);

  const updateMutation = useMutation(
    api.settings.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: api.settings.get.queryKey() });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      },
    })
  );

  const changePasswordMutation = useMutation(
    api.settings.changePassword.mutationOptions({
      onSuccess: () => {
        setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      },
    })
  );

  const clearDataMutation = useMutation(
    api.settings.clearOldData.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: api.settings.getDatabaseStats.queryKey() });
      },
    })
  );

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert("New passwords do not match");
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
  };

  const handleClearOldData = () => {
    if (
      confirm(
        `Are you sure you want to delete data older than ${formData.retentionDays ?? settings?.retentionDays ?? 90} days? This action cannot be undone.`
      )
    ) {
      clearDataMutation.mutate({
        olderThanDays: formData.retentionDays ?? settings?.retentionDays ?? 90,
      });
    }
  };

  // Initialize form data when settings load
  useEffect(() => {
    if (settings && Object.keys(formData).length === 0) {
      setFormData({
        serverName: settings.serverName,
        serverUrl: settings.serverUrl,
        timezone: settings.timezone,
        currency: settings.currency as "USD" | "EUR" | "GBP",
        enablePrometheus: settings.enablePrometheus,
        prometheusPort: settings.prometheusPort,
        retentionDays: settings.retentionDays,
        autoUpdatePricing: settings.autoUpdatePricing,
      });
    }
  }, [settings, formData]);

  const currencies = [
    { value: "USD", label: "USD ($)", symbol: "$" },
    { value: "EUR", label: "EUR (€)", symbol: "€" },
    { value: "GBP", label: "GBP (£)", symbol: "£" },
  ];

  // Show loading while checking auth
  if (sessionLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout
      title="Settings"
      actions={
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className={cn(
            "gap-2 transition-colors",
            saveSuccess && "bg-emerald-600 hover:bg-emerald-600"
          )}
        >
          {saveSuccess ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Saved!
            </>
          ) : updateMutation.isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Server Configuration */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Server Configuration</CardTitle>
                <CardDescription>
                  Configure your server name, URL, and regional settings
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="serverName"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    Server Name
                  </Label>
                  <Input
                    id="serverName"
                    value={formData.serverName ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, serverName: e.target.value })
                    }
                    placeholder="My Homelab"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="serverUrl"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    Server URL
                  </Label>
                  <Input
                    id="serverUrl"
                    value={formData.serverUrl ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, serverUrl: e.target.value })
                    }
                    placeholder="https://claude-tracker.local"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="timezone"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    Timezone
                  </Label>
                  <Input
                    id="timezone"
                    value={formData.timezone ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, timezone: e.target.value })
                    }
                    placeholder="America/New_York"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="currency"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    Currency
                  </Label>
                  <div className="flex gap-2">
                    {currencies.map((currency) => (
                      <button
                        key={currency.value}
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            currency: currency.value as "USD" | "EUR" | "GBP",
                          })
                        }
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                          formData.currency === currency.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
                        )}
                      >
                        {currency.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data & Storage */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <Database className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle>Data & Storage</CardTitle>
                <CardDescription>
                  Manage data retention and storage settings
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="retentionDays"
                  className="text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Data Retention (days)
                </Label>
                <Input
                  id="retentionDays"
                  type="number"
                  value={formData.retentionDays ?? 90}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      retentionDays: parseInt(e.target.value, 10),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Data older than this will be eligible for cleanup
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Auto-update Pricing
                </Label>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      autoUpdatePricing: !formData.autoUpdatePricing,
                    })
                  }
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-4 py-2 transition-colors",
                    formData.autoUpdatePricing
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-border bg-secondary/30"
                  )}
                >
                  <span className="text-sm">
                    {formData.autoUpdatePricing ? "Enabled" : "Disabled"}
                  </span>
                  <div
                    className={cn(
                      "h-5 w-9 rounded-full p-0.5 transition-colors",
                      formData.autoUpdatePricing ? "bg-emerald-500" : "bg-muted"
                    )}
                  >
                    <div
                      className={cn(
                        "h-4 w-4 rounded-full bg-white transition-transform",
                        formData.autoUpdatePricing && "translate-x-4"
                      )}
                    />
                  </div>
                </button>
                <p className="text-xs text-muted-foreground">
                  Fetch latest pricing from LiteLLM daily
                </p>
              </div>
            </div>

            {/* Database Stats */}
            {dbStats && (
              <div className="rounded-lg border border-border bg-secondary/30 p-4">
                <h4 className="mb-3 text-sm font-medium">Database Statistics</h4>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <HardDrive className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Devices</p>
                      <p className="font-mono text-lg font-semibold">
                        {formatNumber(dbStats.devices)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
                      <Layers className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sessions</p>
                      <p className="font-mono text-lg font-semibold">
                        {formatNumber(dbStats.sessions)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                      <FileText className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Entries</p>
                      <p className="font-mono text-lg font-semibold">
                        {formatNumber(dbStats.entries)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              onClick={handleClearOldData}
              disabled={clearDataMutation.isPending}
              className="gap-2"
            >
              {clearDataMutation.isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Clear Old Data
                </>
              )}
            </Button>
            {clearDataMutation.isSuccess && (
              <p className="text-sm text-emerald-500">
                Deleted {clearDataMutation.data?.deletedEntries} old entries
              </p>
            )}
          </CardContent>
        </Card>

        {/* Prometheus Metrics */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
                <Activity className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <CardTitle>Prometheus Metrics</CardTitle>
                <CardDescription>
                  Configure the Prometheus metrics endpoint
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              type="button"
              onClick={() =>
                setFormData({
                  ...formData,
                  enablePrometheus: !formData.enablePrometheus,
                })
              }
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-4 py-3 transition-colors",
                formData.enablePrometheus
                  ? "border-violet-500/30 bg-violet-500/10"
                  : "border-border bg-secondary/30"
              )}
            >
              <div className="flex items-center gap-3">
                <Activity
                  className={cn(
                    "h-5 w-5",
                    formData.enablePrometheus
                      ? "text-violet-500"
                      : "text-muted-foreground"
                  )}
                />
                <div className="text-left">
                  <p className="text-sm font-medium">Enable Prometheus Metrics</p>
                  <p className="text-xs text-muted-foreground">
                    Expose metrics at /metrics endpoint
                  </p>
                </div>
              </div>
              <div
                className={cn(
                  "h-5 w-9 rounded-full p-0.5 transition-colors",
                  formData.enablePrometheus ? "bg-violet-500" : "bg-muted"
                )}
              >
                <div
                  className={cn(
                    "h-4 w-4 rounded-full bg-white transition-transform",
                    formData.enablePrometheus && "translate-x-4"
                  )}
                />
              </div>
            </button>

            {formData.enablePrometheus && (
              <div className="space-y-2">
                <Label
                  htmlFor="prometheusPort"
                  className="text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Metrics Port
                </Label>
                <Input
                  id="prometheusPort"
                  type="number"
                  value={formData.prometheusPort ?? 9090}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      prometheusPort: parseInt(e.target.value, 10),
                    })
                  }
                  className="max-w-[200px]"
                />
                <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Endpoint:</span>
                  <code className="font-mono text-xs text-primary">
                    http://localhost:{formData.prometheusPort ?? 9090}/metrics
                  </code>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
                  <Cpu className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <CardTitle>System Status</CardTitle>
                  <CardDescription>
                    Server health, Redis cache, and runtime information
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchStatus()}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {systemStatus ? (
              <>
                {/* Server Info */}
                <div className="rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Server className="h-4 w-4 text-violet-500" />
                    <h4 className="text-sm font-medium">Server</h4>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Uptime</p>
                      <p className="font-mono text-sm font-medium">
                        {formatUptime(systemStatus.server.uptimeSeconds)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Node Version</p>
                      <p className="font-mono text-sm font-medium">
                        {systemStatus.server.nodeVersion}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Platform</p>
                      <p className="font-mono text-sm font-medium capitalize">
                        {systemStatus.server.platform}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Environment</p>
                      <p className="font-mono text-sm font-medium">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs",
                          systemStatus.server.env === "production"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-amber-500/10 text-amber-500"
                        )}>
                          {systemStatus.server.env}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div className="flex items-center gap-3 rounded-lg bg-background/50 p-3">
                      <MemoryStick className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Heap Used</p>
                        <p className="font-mono text-sm font-semibold">
                          {formatBytes(systemStatus.server.memoryUsage.heapUsed)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg bg-background/50 p-3">
                      <MemoryStick className="h-4 w-4 text-accent" />
                      <div>
                        <p className="text-xs text-muted-foreground">Heap Total</p>
                        <p className="font-mono text-sm font-semibold">
                          {formatBytes(systemStatus.server.memoryUsage.heapTotal)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg bg-background/50 p-3">
                      <MemoryStick className="h-4 w-4 text-violet-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">RSS</p>
                        <p className="font-mono text-sm font-semibold">
                          {formatBytes(systemStatus.server.memoryUsage.rss)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Redis Status */}
                <div className={cn(
                  "rounded-lg border p-4 transition-colors",
                  systemStatus.redis.enabled
                    ? systemStatus.redis.connected
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-red-500/30 bg-red-500/5"
                    : "border-border bg-secondary/30"
                )}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {systemStatus.redis.connected ? (
                        <Wifi className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-muted-foreground" />
                      )}
                      <h4 className="text-sm font-medium">Redis Cache</h4>
                    </div>
                    <span className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                      systemStatus.redis.enabled
                        ? systemStatus.redis.connected
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-red-500/10 text-red-500"
                        : "bg-muted text-muted-foreground"
                    )}>
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        systemStatus.redis.enabled
                          ? systemStatus.redis.connected
                            ? "bg-emerald-500 animate-pulse"
                            : "bg-red-500"
                          : "bg-muted-foreground"
                      )} />
                      {systemStatus.redis.enabled
                        ? systemStatus.redis.connected
                          ? "Connected"
                          : "Disconnected"
                        : "Disabled"}
                    </span>
                  </div>

                  {systemStatus.redis.enabled ? (
                    systemStatus.redis.connected && systemStatus.redis.info ? (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Version</p>
                          <p className="font-mono text-sm font-medium">
                            {systemStatus.redis.info.version ?? "N/A"}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Memory</p>
                          <p className="font-mono text-sm font-medium">
                            {systemStatus.redis.info.usedMemory ?? "N/A"}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Keys</p>
                          <p className="font-mono text-sm font-medium">
                            {formatNumber(systemStatus.redis.info.totalKeys ?? 0)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Clients</p>
                          <p className="font-mono text-sm font-medium">
                            {systemStatus.redis.info.connectedClients ?? "N/A"}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Uptime</p>
                          <p className="font-mono text-sm font-medium">
                            {formatUptime(systemStatus.redis.info.uptime ?? 0)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-red-500">
                        <AlertCircle className="h-4 w-4" />
                        <span>{systemStatus.redis.error ?? "Connection failed"}</span>
                      </div>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Redis caching is disabled. Set <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">REDIS_ENABLED=true</code> to enable.
                    </p>
                  )}

                  {systemStatus.redis.enabled && (
                    <div className="mt-3 flex flex-wrap gap-4 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                      <span>URL: <code className="font-mono">{systemStatus.redis.url || "N/A"}</code></span>
                      <span>TTL: <code className="font-mono">{systemStatus.redis.ttlHours}h</code></span>
                      <span>Prefix: <code className="font-mono">{systemStatus.redis.keyPrefix}</code></span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Application Logs */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                  <Terminal className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <CardTitle>Application Logs</CardTitle>
                  <CardDescription>
                    Runtime logs, API requests, and system events
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchLogs()}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearLogsMutation.mutate()}
                  disabled={clearLogsMutation.isPending}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Log Stats */}
            {systemStatus?.logs && (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setLogLevel(undefined)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    logLevel === undefined
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                  )}
                >
                  All
                  <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px]">
                    {systemStatus.logs.total}
                  </span>
                </button>
                <button
                  onClick={() => setLogLevel("info")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    logLevel === "info"
                      ? "bg-blue-500 text-white"
                      : "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                  )}
                >
                  <Info className="h-3 w-3" />
                  Info
                  <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px]">
                    {systemStatus.logs.byLevel.info}
                  </span>
                </button>
                <button
                  onClick={() => setLogLevel("warn")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    logLevel === "warn"
                      ? "bg-amber-500 text-white"
                      : "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                  )}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Warn
                  <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px]">
                    {systemStatus.logs.byLevel.warn}
                  </span>
                </button>
                <button
                  onClick={() => setLogLevel("error")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    logLevel === "error"
                      ? "bg-red-500 text-white"
                      : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                  )}
                >
                  <AlertCircle className="h-3 w-3" />
                  Error
                  <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px]">
                    {systemStatus.logs.byLevel.error}
                  </span>
                </button>
                <button
                  onClick={() => setLogLevel("debug")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    logLevel === "debug"
                      ? "bg-gray-500 text-white"
                      : "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20"
                  )}
                >
                  <Bug className="h-3 w-3" />
                  Debug
                  <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px]">
                    {systemStatus.logs.byLevel.debug}
                  </span>
                </button>
              </div>
            )}

            {/* Category Filter */}
            {systemStatus?.logs && Object.keys(systemStatus.logs.byCategory).length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  value={logCategory ?? ""}
                  onChange={(e) => setLogCategory(e.target.value || undefined)}
                  className="rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs"
                >
                  <option value="">All Categories</option>
                  {Object.entries(systemStatus.logs.byCategory).map(([cat, count]) => (
                    <option key={cat} value={cat}>
                      {cat} ({count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Logs Container */}
            <div
              ref={logsContainerRef}
              className={cn(
                "rounded-lg border border-border bg-black/50 font-mono text-xs transition-all",
                logsExpanded ? "max-h-[600px]" : "max-h-[300px]",
                "overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border"
              )}
            >
              {logsData && logsData.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {logsData.map((log) => (
                    <div
                      key={log.id}
                      className={cn(
                        "flex items-start gap-3 px-3 py-2 hover:bg-white/5 transition-colors",
                        log.level === "error" && "bg-red-500/5",
                        log.level === "warn" && "bg-amber-500/5"
                      )}
                    >
                      <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                        {formatLogTime(log.timestamp)}
                      </span>
                      <span className={cn(
                        "flex-shrink-0 w-12 text-center uppercase font-semibold",
                        log.level === "info" && "text-blue-400",
                        log.level === "warn" && "text-amber-400",
                        log.level === "error" && "text-red-400",
                        log.level === "debug" && "text-gray-400"
                      )}>
                        {log.level}
                      </span>
                      <span className="flex-shrink-0 w-20 text-purple-400 truncate">
                        [{log.category}]
                      </span>
                      <span className="flex-1 text-foreground/90 break-all">
                        {log.message}
                        {log.details && (
                          <span className="ml-2 text-muted-foreground">
                            {JSON.stringify(log.details)}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Terminal className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No logs available</p>
                  <p className="text-xs">Logs will appear as the application runs</p>
                </div>
              )}
            </div>

            {/* Expand/Collapse */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setLogsExpanded(!logsExpanded)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={cn(
                  "h-4 w-4 transition-transform",
                  logsExpanded && "rotate-180"
                )} />
                {logsExpanded ? "Show less" : "Show more"}
              </button>
              {systemStatus?.logs && (
                <span className="text-xs text-muted-foreground">
                  Showing {logsData?.length ?? 0} of {systemStatus.logs.total} logs
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account Security */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <Shield className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <CardTitle>Account Security</CardTitle>
                <CardDescription>Change your admin password</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="currentPassword"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    Current Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showPasswords.current ? "text" : "password"}
                      value={passwordData.currentPassword}
                      onChange={(e) =>
                        setPasswordData({
                          ...passwordData,
                          currentPassword: e.target.value,
                        })
                      }
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords({
                          ...showPasswords,
                          current: !showPasswords.current,
                        })
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords.current ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="newPassword"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPasswords.new ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) =>
                        setPasswordData({
                          ...passwordData,
                          newPassword: e.target.value,
                        })
                      }
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords({
                          ...showPasswords,
                          new: !showPasswords.new,
                        })
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords.new ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="confirmPassword"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showPasswords.confirm ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) =>
                        setPasswordData({
                          ...passwordData,
                          confirmPassword: e.target.value,
                        })
                      }
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords({
                          ...showPasswords,
                          confirm: !showPasswords.confirm,
                        })
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords.confirm ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              {passwordData.newPassword &&
                passwordData.confirmPassword &&
                passwordData.newPassword !== passwordData.confirmPassword && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="h-4 w-4" />
                    Passwords do not match
                  </div>
                )}
              {changePasswordMutation.error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {changePasswordMutation.error.message}
                </div>
              )}
              {changePasswordMutation.isSuccess && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-500">
                  <CheckCircle className="h-4 w-4" />
                  Password changed successfully
                </div>
              )}
              <Button
                type="submit"
                variant="outline"
                disabled={
                  changePasswordMutation.isPending ||
                  !passwordData.currentPassword ||
                  !passwordData.newPassword ||
                  passwordData.newPassword !== passwordData.confirmPassword
                }
                className="gap-2"
              >
                {changePasswordMutation.isPending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Changing...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Change Password
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/20">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>
                  Irreversible and destructive actions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Reset All Data</p>
                <p className="text-xs text-muted-foreground">
                  Delete all sessions, entries, and device data. This cannot be undone.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => {
                  if (
                    confirm(
                      "Are you absolutely sure? This will delete ALL data including devices, sessions, and usage entries. This action cannot be undone."
                    )
                  ) {
                    // TODO: Implement reset all data
                    alert("This feature is not yet implemented");
                  }
                }}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Reset All Data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
