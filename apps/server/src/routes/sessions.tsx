"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Layers,
  Clock,
  Coins,
  ChevronLeft,
  ChevronRight,
  Database,
  Zap,
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
import { Layout } from "~/app/components/layout";
import { useTRPC } from "~/trpc/react";
import {
  formatCurrency,
  formatNumber,
  formatRelativeTime,
  formatDuration,
  cn,
} from "~/app/lib/utils";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/sessions")({
  component: SessionsPage,
});

function SessionsPage() {
  const navigate = useNavigate();
  const api = useTRPC();
  const [page, setPage] = useState(1);
  const limit = 20;

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

  const { data, isLoading } = useQuery({
    ...api.sessions.list.queryOptions({
      limit,
      offset: (page - 1) * limit,
    }),
    enabled: !!session,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  // Calculate stats from all sessions
  const { data: stats } = useQuery({
    ...api.stats.overview.queryOptions({}),
    enabled: !!session,
  });

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
    <Layout title="Sessions">
      <div className="space-y-6">
        {/* Stats Row */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card variant="metric" accentColor="violet">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
                  <Layers className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Total Sessions
                  </p>
                  <p className="font-mono text-2xl font-semibold">
                    {formatNumber(stats?.sessionsCount ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="metric" accentColor="amber">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                  <Coins className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Total Cost
                  </p>
                  <p className="font-mono text-2xl font-semibold text-amber-500">
                    {formatCurrency(stats?.totalCostUSD ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="metric" accentColor="emerald">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Zap className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Cache Hits
                  </p>
                  <p className="font-mono text-2xl font-semibold text-emerald-500">
                    {formatNumber(stats?.totalCacheReadTokens ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="metric" accentColor="rose">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10">
                  <Database className="h-5 w-5 text-rose-500" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Total Tokens
                  </p>
                  <p className="font-mono text-2xl font-semibold text-rose-500">
                    {formatNumber(
                      (stats?.totalInputTokens ?? 0) +
                        (stats?.totalOutputTokens ?? 0)
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sessions Table */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Session History</CardTitle>
                  <CardDescription>
                    View all Claude Code sessions across your devices
                  </CardDescription>
                </div>
              </div>
              {data && (
                <div className="hidden text-sm text-muted-foreground sm:block">
                  Showing {(page - 1) * limit + 1}-
                  {Math.min(page * limit, data.total)} of {data.total}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-lg border border-border bg-secondary/30 p-4"
                  >
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : data?.sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/50">
                  <FileText className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="mt-4 font-medium">No sessions recorded yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start using Claude Code to see your sessions here
                </p>
              </div>
            ) : (
              <>
                {/* Table Header */}
                <div className="mb-2 hidden grid-cols-[1fr_120px_100px_100px_80px_80px_80px_80px] gap-4 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
                  <div>Project</div>
                  <div>Device</div>
                  <div>Started</div>
                  <div>Duration</div>
                  <div className="text-right">Input</div>
                  <div className="text-right">Output</div>
                  <div className="text-right">Cache</div>
                  <div className="text-right">Cost</div>
                </div>

                {/* Table Body */}
                <div className="space-y-2">
                  {data?.sessions.map((session, i) => {
                    const duration = session.endedAt
                      ? Math.floor(
                          (new Date(session.endedAt).getTime() -
                            new Date(session.startedAt).getTime()) /
                            1000
                        )
                      : null;

                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "group rounded-lg border border-border bg-secondary/30 p-4 transition-all hover:bg-secondary/50",
                          "animate-fade-in"
                        )}
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
                        {/* Mobile Layout */}
                        <div className="md:hidden">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                <Layers className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">
                                  {session.project.split("/").pop() ||
                                    session.project}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {session.device.name}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm font-medium text-amber-500">
                                {formatCurrency(session.totalCostUSD)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatNumber(session.totalInputTokens + session.totalOutputTokens)} tokens
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(new Date(session.startedAt))}
                            </span>
                            {duration && (
                              <>
                                <span className="text-border">|</span>
                                <span>{formatDuration(duration)}</span>
                              </>
                            )}
                            {!duration && (
                              <Badge variant="success" className="text-xs">
                                Active
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Desktop Layout */}
                        <div className="hidden grid-cols-[1fr_120px_100px_100px_80px_80px_80px_80px] items-center gap-4 md:grid">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <Layers className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p
                                className="truncate font-medium text-sm"
                                title={session.project}
                              >
                                {session.project.split("/").pop() ||
                                  session.project}
                              </p>
                              <p
                                className="truncate text-xs text-muted-foreground"
                                title={session.project}
                              >
                                {session.project}
                              </p>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {session.device.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatRelativeTime(new Date(session.startedAt))}
                          </div>
                          <div className="text-sm">
                            {duration ? (
                              <span className="text-muted-foreground">
                                {formatDuration(duration)}
                              </span>
                            ) : (
                              <Badge variant="success" className="text-xs">
                                Active
                              </Badge>
                            )}
                          </div>
                          <div className="text-right font-mono text-sm text-emerald-500">
                            {formatNumber(session.totalInputTokens)}
                          </div>
                          <div className="text-right font-mono text-sm text-amber-500">
                            {formatNumber(session.totalOutputTokens)}
                          </div>
                          <div className="text-right font-mono text-sm text-violet-500">
                            {formatNumber(session.totalCacheReadTokens)}
                          </div>
                          <div className="text-right font-mono text-sm font-medium">
                            {formatCurrency(session.totalCostUSD)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                    <div className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
