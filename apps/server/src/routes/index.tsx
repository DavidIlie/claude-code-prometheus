"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  DollarSign,
  Zap,
  Clock,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Database,
  Layers,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/app/components/ui/card";
import { Button } from "~/app/components/ui/button";
import { Skeleton } from "~/app/components/ui/skeleton";
import { Layout } from "~/app/components/layout";
import { useTRPC } from "~/trpc/react";
import {
  formatCurrency,
  formatNumber,
  formatRelativeTime,
} from "~/app/lib/utils";
import { cn } from "~/app/lib/utils";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const api = useTRPC();

  // Check if setup is completed
  const { data: setupStatus, isLoading: setupLoading } = useQuery(
    api.setup.getStatus.queryOptions()
  );

  // Check if user is authenticated
  const { data: session, isLoading: sessionLoading, error: sessionError } = useQuery({
    ...api.auth.getSession.queryOptions(),
    retry: false,
  });

  useEffect(() => {
    if (!setupLoading && setupStatus && !setupStatus.setupCompleted) {
      navigate({ to: "/setup" });
      return;
    }

    // Redirect to login if not authenticated (after setup check)
    if (!sessionLoading && sessionError) {
      navigate({ to: "/login" });
    }
  }, [setupStatus, setupLoading, sessionLoading, sessionError, navigate]);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    ...api.stats.overview.queryOptions({}),
    enabled: setupStatus?.setupCompleted,
  });

  const { data: recentSessions, isLoading: sessionsLoading } = useQuery({
    ...api.stats.recentSessions.queryOptions({ limit: 5 }),
    enabled: setupStatus?.setupCompleted,
  });

  // Show loading while checking setup status and authentication
  if (setupLoading || sessionLoading || !setupStatus?.setupCompleted || !session) {
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
    <Layout title="Dashboard">
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Cost"
            subtitle="This month"
            value={
              overviewLoading
                ? undefined
                : formatCurrency(overview?.totalCostUSD ?? 0)
            }
            icon={DollarSign}
            loading={overviewLoading}
            accentColor="amber"
            trend={12}
          />
          <MetricCard
            title="Total Tokens"
            subtitle="All time"
            value={
              overviewLoading
                ? undefined
                : formatNumber(
                    (overview?.totalInputTokens ?? 0) +
                      (overview?.totalOutputTokens ?? 0)
                  )
            }
            icon={Activity}
            loading={overviewLoading}
            accentColor="emerald"
          />
          <MetricCard
            title="Sessions"
            subtitle="All time"
            value={
              overviewLoading
                ? undefined
                : formatNumber(overview?.sessionsCount ?? 0)
            }
            icon={Layers}
            loading={overviewLoading}
            accentColor="violet"
          />
          <MetricCard
            title="Active Devices"
            subtitle="Connected"
            value={
              overviewLoading
                ? undefined
                : `${overview?.activeDevices ?? 0} / ${overview?.totalDevices ?? 0}`
            }
            icon={Zap}
            loading={overviewLoading}
            accentColor="rose"
          />
        </div>

        {/* Token Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" />
              Token Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-4">
                <TokenStat
                  label="Input Tokens"
                  value={overview?.totalInputTokens ?? 0}
                  color="emerald"
                />
                <TokenStat
                  label="Output Tokens"
                  value={overview?.totalOutputTokens ?? 0}
                  color="amber"
                />
                <TokenStat
                  label="Cache Created"
                  value={overview?.totalCacheCreationTokens ?? 0}
                  color="violet"
                />
                <TokenStat
                  label="Cache Read"
                  value={overview?.totalCacheReadTokens ?? 0}
                  color="rose"
                  highlight
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Sessions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" />
              Recent Sessions
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/sessions" className="gap-1">
                View all
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentSessions?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Layers className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No sessions yet. Start using Claude Code to see data here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSessions?.map((session, i) => (
                  <div
                    key={session.id}
                    className={cn(
                      "group flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-3 transition-all hover:bg-secondary/50",
                      "animate-fade-in"
                    )}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Layers className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm leading-tight">
                          {session.project.split("/").pop() || session.project}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session.device.name} •{" "}
                          {formatRelativeTime(new Date(session.startedAt))}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-medium">
                        {formatNumber(session.totalTokens)}
                        <span className="ml-1 text-xs text-muted-foreground">
                          tokens
                        </span>
                      </p>
                      <p className="font-mono text-xs text-accent">
                        {formatCurrency(session.totalCostUSD)}
                      </p>
                    </div>
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

function MetricCard({
  title,
  subtitle,
  value,
  icon: Icon,
  loading = false,
  accentColor = "emerald",
  trend,
}: {
  title: string;
  subtitle: string;
  value?: string;
  icon: React.ElementType;
  loading?: boolean;
  accentColor?: "emerald" | "amber" | "violet" | "rose";
  trend?: number;
}) {
  return (
    <Card variant="metric" accentColor={accentColor}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="font-mono text-2xl font-semibold tracking-tight">
                {value}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              accentColor === "emerald" && "bg-emerald-500/10",
              accentColor === "amber" && "bg-amber-500/10",
              accentColor === "violet" && "bg-violet-500/10",
              accentColor === "rose" && "bg-rose-500/10"
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5",
                accentColor === "emerald" && "text-emerald-500",
                accentColor === "amber" && "text-amber-500",
                accentColor === "violet" && "text-violet-500",
                accentColor === "rose" && "text-rose-500"
              )}
            />
          </div>
        </div>
        {trend !== undefined && (
          <div className="mt-3 flex items-center gap-1">
            {trend >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
            )}
            <span
              className={cn(
                "text-xs font-medium",
                trend >= 0 ? "text-emerald-500" : "text-rose-500"
              )}
            >
              {Math.abs(trend)}%
            </span>
            <span className="text-xs text-muted-foreground">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TokenStat({
  label,
  value,
  color,
  highlight = false,
}: {
  label: string;
  value: number;
  color: "emerald" | "amber" | "violet" | "rose";
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-secondary/30 p-3 transition-colors",
        highlight && "border-rose-500/30 bg-rose-500/5"
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-xl font-semibold",
          color === "emerald" && "text-emerald-500",
          color === "amber" && "text-amber-500",
          color === "violet" && "text-violet-500",
          color === "rose" && "text-rose-500"
        )}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}
