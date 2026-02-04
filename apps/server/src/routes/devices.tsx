"use client";

import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Copy,
  Check,
  Monitor,
  Server,
  Wifi,
  WifiOff,
  Key,
  Clock,
  Layers,
  AlertCircle,
} from "lucide-react";
import { Button } from "~/app/components/ui/button";
import { Badge } from "~/app/components/ui/badge";
import { Skeleton } from "~/app/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/app/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/app/components/ui/dialog";
import { Input } from "~/app/components/ui/input";
import { Label } from "~/app/components/ui/label";
import { Layout } from "~/app/components/layout";
import { useTRPC } from "~/trpc/react";
import { formatRelativeTime, cn } from "~/app/lib/utils";

// Generate hostname from device name
function generateHostname(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63) + ".local";
}

export const Route = createFileRoute("/devices")({
  component: DevicesPage,
});

function DevicesPage() {
  const navigate = useNavigate();
  const api = useTRPC();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [hostnameOverride, setHostnameOverride] = useState("");
  const [registeredDevice, setRegisteredDevice] = useState<{
    deviceId: string;
    apiKey: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Compute hostname - use override if provided, otherwise generate from name
  const hostname = hostnameOverride || generateHostname(deviceName);

  // Check authentication
  const { data: session, isLoading: sessionLoading, error: sessionError } = useQuery({
    ...api.auth.getSession.queryOptions(),
    retry: false,
  });

  const { data: devices, isLoading } = useQuery({
    ...api.devices.list.queryOptions(),
    enabled: !!session,
  });

  // All mutations must be declared before any conditional returns
  const registerMutation = useMutation(
    api.devices.register.mutationOptions({
      onSuccess: (data) => {
        setRegisteredDevice(data);
        queryClient.invalidateQueries({ queryKey: api.devices.list.queryKey() });
      },
    })
  );

  const deleteMutation = useMutation(
    api.devices.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: api.devices.list.queryKey() });
      },
    })
  );

  useEffect(() => {
    if (!sessionLoading && sessionError) {
      navigate({ to: "/login" });
    }
  }, [sessionLoading, sessionError, navigate]);

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

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate({ name: deviceName, hostname });
  };

  const handleCopyKey = async () => {
    if (registeredDevice?.apiKey) {
      await navigator.clipboard.writeText(registeredDevice.apiKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setRegisteredDevice(null);
      setDeviceName("");
      setHostnameOverride("");
      registerMutation.reset();
    }
    setDialogOpen(open);
  };

  const onlineCount = devices?.filter((d) => d.isOnline).length ?? 0;
  const totalCount = devices?.length ?? 0;

  return (
    <Layout
      title="Devices"
      actions={
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Register Device</span>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Stats Row */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card variant="metric" accentColor="violet">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
                  <Server className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Total Devices
                  </p>
                  <p className="font-mono text-2xl font-semibold">{totalCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="metric" accentColor="emerald">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Wifi className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Online
                  </p>
                  <p className="font-mono text-2xl font-semibold text-emerald-500">
                    {onlineCount}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="metric" accentColor="rose">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10">
                  <WifiOff className="h-5 w-5 text-rose-500" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Offline
                  </p>
                  <p className="font-mono text-2xl font-semibold text-rose-500">
                    {totalCount - onlineCount}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Register Device Dialog */}
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent className="sm:max-w-md">
            {registeredDevice ? (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Key className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      <DialogTitle>Device Registered</DialogTitle>
                      <DialogDescription>
                        Save your API key - you won't be able to see it again!
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                      <Check className="h-4 w-4" />
                      <span>Device registered successfully!</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Device ID
                    </Label>
                    <Input
                      value={registeredDevice.deviceId}
                      readOnly
                      className="bg-secondary/50 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      API Key
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={registeredDevice.apiKey}
                        readOnly
                        className="bg-secondary/50 font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyKey}
                        className={cn(
                          copiedKey && "border-emerald-500/50 text-emerald-500"
                        )}
                      >
                        {copiedKey ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use this key in your daemon configuration
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => handleDialogClose(false)} className="w-full">
                    Done
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <DialogTitle>Register New Device</DialogTitle>
                      <DialogDescription>
                        Add a new device to track Claude Code usage
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <form onSubmit={handleRegister} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="deviceName"
                      className="text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      Device Name
                    </Label>
                    <Input
                      id="deviceName"
                      placeholder="My MacBook Pro"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="hostname"
                      className="text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      Hostname{" "}
                      <span className="font-normal normal-case text-muted-foreground/70">
                        (auto-generated)
                      </span>
                    </Label>
                    <Input
                      id="hostname"
                      placeholder={deviceName ? hostname : "auto-generated from name"}
                      value={hostnameOverride}
                      onChange={(e) => setHostnameOverride(e.target.value)}
                      className="font-mono text-sm"
                    />
                    {deviceName && !hostnameOverride && (
                      <p className="text-xs text-muted-foreground">
                        Will use: <span className="font-mono">{hostname}</span>
                      </p>
                    )}
                  </div>
                  {registerMutation.error && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span>{registerMutation.error.message}</span>
                    </div>
                  )}
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleDialogClose(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={registerMutation.isPending || !deviceName}
                    >
                      {registerMutation.isPending ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Registering...
                        </>
                      ) : (
                        "Register Device"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Devices List */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Monitor className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>All Devices</CardTitle>
                <CardDescription>
                  Manage your registered devices and their API keys
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-lg border border-border bg-secondary/30 p-4"
                  >
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : devices?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/50">
                  <Monitor className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="mt-4 font-medium">No devices registered</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Click "Register Device" to add your first device
                </p>
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="mt-4 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Register Device
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {devices?.map((device, i) => (
                  <div
                    key={device.id}
                    className={cn(
                      "group flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4 transition-all hover:bg-secondary/50",
                      "animate-fade-in"
                    )}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-lg",
                          device.isOnline
                            ? "bg-emerald-500/10"
                            : "bg-muted"
                        )}
                      >
                        <Monitor
                          className={cn(
                            "h-6 w-6",
                            device.isOnline
                              ? "text-emerald-500"
                              : "text-muted-foreground"
                          )}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{device.name}</p>
                          <Badge
                            variant={device.isOnline ? "online" : "offline"}
                            className="text-xs"
                          >
                            {device.isOnline ? "Online" : "Offline"}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-mono">{device.hostname}</span>
                          <span className="text-border">|</span>
                          <span className="flex items-center gap-1">
                            <Layers className="h-3 w-3" />
                            {device.sessionsCount} sessions
                          </span>
                          <span className="text-border">|</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(new Date(device.lastSeen))}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (
                          confirm(
                            `Are you sure you want to delete "${device.name}"? This action cannot be undone.`
                          )
                        ) {
                          deleteMutation.mutate({ id: device.id });
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
