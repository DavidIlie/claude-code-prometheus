"use client";

import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "~/app/components/ui/button";
import { Input } from "~/app/components/ui/input";
import { Label } from "~/app/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/app/components/ui/card";
import { useTRPC } from "~/trpc/react";
import { Terminal, Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const api = useTRPC();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);

  // Check auto-login status on page load
  const autoLoginQuery = useQuery({
    ...api.auth.getAutoLoginStatus.queryOptions(),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Handle auto-login
  useEffect(() => {
    if (autoLoginQuery.data?.autoLoginEnabled && autoLoginQuery.data?.token) {
      setIsAutoLoggingIn(true);

      // Set the auth cookie
      document.cookie = `auth-token=${autoLoginQuery.data.token}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=strict`;

      // Small delay for visual feedback
      setTimeout(() => {
        navigate({ to: "/" });
      }, 500);
    }
  }, [autoLoginQuery.data, navigate]);

  const loginMutation = useMutation(
    api.auth.login.mutationOptions({
      onSuccess: (data) => {
        // Set cookie
        document.cookie = `auth-token=${data.token}; path=/; max-age=${7 * 24 * 60 * 60}; samesite=strict`;
        navigate({ to: "/" });
      },
      onError: (err) => {
        setError(err.message);
      },
    })
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate({ username, password });
  };

  // Show auto-login loading state
  if (autoLoginQuery.isLoading || isAutoLoggingIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Terminal className="h-8 w-8 text-primary" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">
              {isAutoLoggingIn ? "Auto-logging in..." : "Checking authentication..."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      {/* Background grid pattern */}
      <div className="fixed inset-0 grid-pattern opacity-30" />

      {/* Logo */}
      <div className="relative mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Terminal className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Claude <span className="text-gradient">Tracker</span>
        </h1>
      </div>

      <Card className="relative w-full max-w-md border-border bg-card/50 backdrop-blur">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to your Claude Usage Tracker account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {/* Auto-login hint */}
          {autoLoginQuery.data?.autoLoginEnabled === false && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              <span>Auto-login disabled</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="relative mt-6 text-center text-xs text-muted-foreground">
        Claude Tracker • Usage monitoring for Claude Code
      </p>
    </div>
  );
}
