"use client";

import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "~/app/components/ui/button";
import { Input } from "~/app/components/ui/input";
import { Select } from "~/app/components/ui/select";
import { TimezoneSelect } from "~/app/components/ui/timezone-select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
  useZodForm,
} from "~/app/components/ui/form";
import { useTRPC } from "~/trpc/react";
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Terminal,
  User,
  Server,
  Settings,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  AlertTriangle,
  ShieldAlert,
  X,
  Pencil,
  UserCheck,
} from "lucide-react";
import { cn } from "~/app/lib/utils";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

type Step = "welcome" | "admin" | "server" | "optional" | "complete";

const steps: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: "welcome", label: "Welcome", icon: Sparkles },
  { key: "admin", label: "Admin", icon: User },
  { key: "server", label: "Server", icon: Server },
  { key: "optional", label: "Options", icon: Settings },
  { key: "complete", label: "Complete", icon: Check },
];

// Zod Schemas
const adminSchema = z
  .object({
    username: z.string().min(1, "Username is required"),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type AdminFormValues = z.infer<typeof adminSchema>;

const editAdminSchema = z
  .object({
    username: z.string().min(1, "Username is required").optional(),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .optional()
      .or(z.literal("")),
    confirmPassword: z.string().optional().or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.password && data.password.length > 0) {
        return data.password === data.confirmPassword;
      }
      return true;
    },
    {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    }
  );

type EditAdminFormValues = z.infer<typeof editAdminSchema>;

const serverSchema = z.object({
  serverName: z.string().min(1, "Instance name is required"),
  serverUrl: z.string().url("Invalid URL"),
  timezone: z.string().min(1, "Timezone is required"),
  currency: z.enum(["USD", "EUR", "GBP"]),
});

type ServerFormValues = z.infer<typeof serverSchema>;

const optionalSchema = z.object({
  enablePrometheus: z.boolean(),
  prometheusPort: z.coerce.number().min(1).max(65535),
  autoUpdatePricing: z.boolean(),
  autoLogin: z.boolean(),
  retentionDays: z.coerce.number().min(1).max(365),
});

type OptionalFormValues = z.infer<typeof optionalSchema>;

// Auto-login warning dialog component
function AutoLoginWarningDialog({
  isOpen,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md animate-fade-in rounded-2xl border border-destructive/30 bg-card p-6 shadow-2xl shadow-destructive/10">
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/20">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold">Security Warning</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Auto-login bypasses authentication and should <strong>only</strong>{" "}
            be used when this server is protected by an external authentication
            layer (e.g., Authelia, Authentik, Cloudflare Access).
          </p>
        </div>
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="text-xs text-destructive">
              <p className="font-medium">
                Enabling auto-login without external protection:
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-destructive/90">
                <li>Anyone with network access can view your data</li>
                <li>No password will be required to access the dashboard</li>
                <li>All API keys and device information will be exposed</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="flex-1">
            I Understand, Enable
          </Button>
        </div>
      </div>
    </div>
  );
}

function SetupPage() {
  const navigate = useNavigate();
  const api = useTRPC();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("welcome");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showAutoLoginWarning, setShowAutoLoginWarning] = useState(false);
  const [showEditAdminDialog, setShowEditAdminDialog] = useState(false);

  // Query setup status
  const { data: setupStatus, isLoading: setupLoading } = useQuery(
    api.setup.getStatus.queryOptions()
  );

  // Redirect to dashboard if setup is already completed
  useEffect(() => {
    if (!setupLoading && setupStatus?.setupCompleted) {
      navigate({ to: "/" });
    }
  }, [setupStatus, setupLoading, navigate]);

  // Form instances
  const adminForm = useZodForm({
    schema: adminSchema,
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const editAdminForm = useZodForm({
    schema: editAdminSchema,
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const serverForm = useZodForm({
    schema: serverSchema,
    defaultValues: {
      serverName: "Claude Tracker",
      serverUrl: typeof window !== "undefined" ? window.location.origin : "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      currency: "USD",
    },
  });

  const optionalForm = useZodForm({
    schema: optionalSchema,
    defaultValues: {
      enablePrometheus: true,
      prometheusPort: 9090,
      autoUpdatePricing: true,
      autoLogin: false,
      retentionDays: 90,
    },
  });

  // Mutations
  const createAdminMutation = useMutation(
    api.setup.createAdmin.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: api.setup.getStatus.queryKey(),
        });
        setStep("server");
      },
    })
  );

  const updateAdminMutation = useMutation(
    api.setup.updateAdmin.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: api.setup.getStatus.queryKey(),
        });
        setShowEditAdminDialog(false);
        editAdminForm.reset();
      },
    })
  );

  const saveServerMutation = useMutation(
    api.setup.saveServerConfig.mutationOptions({
      onSuccess: () => {
        setStep("optional");
      },
    })
  );

  const saveOptionalMutation = useMutation(
    api.setup.saveOptionalConfig.mutationOptions({
      onSuccess: () => {
        setStep("complete");
      },
    })
  );

  const completeSetupMutation = useMutation(
    api.setup.completeSetup.mutationOptions({
      onSuccess: (data) => {
        document.cookie = `auth-token=${data.token}; path=/; max-age=${7 * 24 * 60 * 60}; samesite=strict`;
        navigate({ to: "/" });
      },
    })
  );

  // Form handlers
  const onAdminSubmit = (data: AdminFormValues) => {
    createAdminMutation.mutate({
      username: data.username,
      email: data.email || undefined,
      password: data.password,
      confirmPassword: data.confirmPassword,
    });
  };

  const onEditAdminSubmit = (data: EditAdminFormValues) => {
    const payload: { username?: string; email?: string; password?: string } =
      {};
    if (data.username) payload.username = data.username;
    if (data.email !== undefined) payload.email = data.email;
    if (data.password && data.password.length > 0)
      payload.password = data.password;

    updateAdminMutation.mutate(payload);
  };

  const onServerSubmit = (data: ServerFormValues) => {
    saveServerMutation.mutate(data);
  };

  const onOptionalSubmit = (data: OptionalFormValues) => {
    saveOptionalMutation.mutate(data);
  };

  const openEditDialog = () => {
    editAdminForm.reset({
      username: setupStatus?.admin?.username || "",
      email: setupStatus?.admin?.email || "",
      password: "",
      confirmPassword: "",
    });
    setShowEditAdminDialog(true);
  };

  const handleAutoLoginToggle = (checked: boolean) => {
    if (checked) {
      setShowAutoLoginWarning(true);
    } else {
      optionalForm.setValue("autoLogin", false);
    }
  };

  const confirmAutoLogin = () => {
    optionalForm.setValue("autoLogin", true);
    setShowAutoLoginWarning(false);
  };

  const cancelAutoLogin = () => {
    setShowAutoLoginWarning(false);
  };

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-background">
      {/* Auto-login warning dialog */}
      <AutoLoginWarningDialog
        isOpen={showAutoLoginWarning}
        onConfirm={confirmAutoLogin}
        onCancel={cancelAutoLogin}
      />

      {/* Edit Admin Dialog */}
      {showEditAdminDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowEditAdminDialog(false)}
          />
          <div className="relative z-10 w-full max-w-md animate-fade-in rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              onClick={() => setShowEditAdminDialog(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Edit Admin Account</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Update your credentials. Leave password blank to keep current.
              </p>
            </div>

            {updateAdminMutation.error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {updateAdminMutation.error.message}
              </div>
            )}

            <Form {...editAdminForm}>
              <form
                onSubmit={editAdminForm.handleSubmit(onEditAdminSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={editAdminForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="admin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editAdminForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Email{" "}
                        <span className="text-muted-foreground">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editAdminForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        New Password{" "}
                        <span className="text-muted-foreground">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Leave blank to keep current"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {editAdminForm.watch("password") && (
                  <FormField
                    control={editAdminForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowEditAdminDialog(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={updateAdminMutation.isPending}
                  >
                    {updateAdminMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      )}

      {/* Background grid pattern */}
      <div className="fixed inset-0 grid-pattern opacity-30" />

      {/* Content */}
      <div className="relative flex min-h-screen flex-col items-center justify-center p-4">
        {/* Logo and title */}
        <div className="mb-8 animate-fade-in text-center">
          <div className="glow mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Terminal className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Claude <span className="text-gradient">Tracker</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Usage monitoring for Claude Code
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 flex animate-fade-in items-center gap-1 delay-75">
          {steps.map((s, i) => {
            const StepIcon = s.icon;
            const isCompleted = i < currentStepIndex;
            const isCurrent = i === currentStepIndex;

            return (
              <div key={s.key} className="flex items-center">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300",
                    isCompleted && "bg-primary text-primary-foreground",
                    isCurrent &&
                      "border border-primary/50 bg-primary/20 text-primary",
                    !isCompleted && !isCurrent && "bg-secondary text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <StepIcon className="h-4 w-4" />
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      "mx-1 h-0.5 w-8 rounded-full transition-colors duration-300",
                      i < currentStepIndex ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="w-full max-w-md animate-fade-in delay-150">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-black/20">
            {/* Welcome Step */}
            {step === "welcome" && (
              <div className="space-y-6 text-center">
                <div>
                  <h2 className="text-xl font-semibold">Welcome to Setup</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Track your Claude Code usage across all your machines with
                    Prometheus metrics and a beautiful dashboard.
                  </p>
                </div>

                <div className="space-y-3 text-left">
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Terminal className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Automatic Tracking</p>
                      <p className="text-xs text-muted-foreground">
                        Daemon watches your Claude Code sessions
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                      <Server className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Prometheus Metrics</p>
                      <p className="text-xs text-muted-foreground">
                        Export to Grafana or any metrics system
                      </p>
                    </div>
                  </div>
                </div>

                <Button onClick={() => setStep("admin")} className="w-full">
                  Get Started
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Admin Step */}
            {step === "admin" && (
              <div className="space-y-5">
                {setupStatus?.hasAdmin ? (
                  <>
                    <div>
                      <h2 className="text-xl font-semibold">Admin Account</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        An administrator account has already been created
                      </p>
                    </div>

                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
                          <UserCheck className="h-6 w-6 text-emerald-500" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">
                            {setupStatus.admin?.username}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {setupStatus.admin?.email || "No email set"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={openEditDialog}
                          className="gap-2"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep("welcome")}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button className="flex-1" onClick={() => setStep("server")}>
                        Continue
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <h2 className="text-xl font-semibold">
                        Create Admin Account
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Set up your administrator credentials
                      </p>
                    </div>

                    {createAdminMutation.error && (
                      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {createAdminMutation.error.message}
                      </div>
                    )}

                    <Form {...adminForm}>
                      <form
                        onSubmit={adminForm.handleSubmit(onAdminSubmit)}
                        className="space-y-4"
                      >
                        <FormField
                          control={adminForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input placeholder="admin" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={adminForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Email{" "}
                                <span className="text-muted-foreground">
                                  (optional)
                                </span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="email"
                                  placeholder="you@example.com"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={adminForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    className="pr-10"
                                    {...field}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  >
                                    {showPassword ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={adminForm.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Confirm Password</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type={
                                      showConfirmPassword ? "text" : "password"
                                    }
                                    placeholder="••••••••"
                                    className="pr-10"
                                    {...field}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowConfirmPassword(!showConfirmPassword)
                                    }
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  >
                                    {showConfirmPassword ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex gap-3 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setStep("welcome")}
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Back
                          </Button>
                          <Button
                            type="submit"
                            className="flex-1"
                            disabled={createAdminMutation.isPending}
                          >
                            {createAdminMutation.isPending
                              ? "Creating..."
                              : "Continue"}
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </>
                )}
              </div>
            )}

            {/* Server Step */}
            {step === "server" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold">Server Configuration</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Configure your tracker instance
                  </p>
                </div>

                {saveServerMutation.error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {saveServerMutation.error.message}
                  </div>
                )}

                <Form {...serverForm}>
                  <form
                    onSubmit={serverForm.handleSubmit(onServerSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={serverForm.control}
                      name="serverName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instance Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Claude Tracker" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={serverForm.control}
                      name="serverUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Server URL</FormLabel>
                          <FormControl>
                            <Input
                              type="url"
                              placeholder="https://claude-tracker.local"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={serverForm.control}
                      name="timezone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timezone</FormLabel>
                          <FormControl>
                            <TimezoneSelect
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={serverForm.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <FormControl>
                            <Select
                              value={field.value}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value as "USD" | "EUR" | "GBP"
                                )
                              }
                              options={[
                                { value: "USD", label: "USD ($)" },
                                { value: "EUR", label: "EUR (€)" },
                                { value: "GBP", label: "GBP (£)" },
                              ]}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep("admin")}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={saveServerMutation.isPending}
                      >
                        {saveServerMutation.isPending ? "Saving..." : "Continue"}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            )}

            {/* Optional Step */}
            {step === "optional" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold">Optional Settings</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Fine-tune your tracker settings
                  </p>
                </div>

                {saveOptionalMutation.error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {saveOptionalMutation.error.message}
                  </div>
                )}

                <Form {...optionalForm}>
                  <form
                    onSubmit={optionalForm.handleSubmit(onOptionalSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={optionalForm.control}
                      name="enablePrometheus"
                      render={({ field }) => (
                        <FormItem>
                          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-secondary/30 p-3 transition-colors hover:bg-secondary/50">
                            <div>
                              <p className="text-sm font-medium">
                                Prometheus Metrics
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Enable the /metrics endpoint
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-5 w-5 rounded border-border accent-primary"
                            />
                          </label>
                        </FormItem>
                      )}
                    />

                    {optionalForm.watch("enablePrometheus") && (
                      <FormField
                        control={optionalForm.control}
                        name="prometheusPort"
                        render={({ field }) => (
                          <FormItem className="ml-4">
                            <FormLabel>Metrics Port</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="9090"
                                className="max-w-[140px]"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Port for the /metrics endpoint
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={optionalForm.control}
                      name="autoUpdatePricing"
                      render={({ field }) => (
                        <FormItem>
                          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-secondary/30 p-3 transition-colors hover:bg-secondary/50">
                            <div>
                              <p className="text-sm font-medium">
                                Auto-update Pricing
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Fetch latest model prices daily
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-5 w-5 rounded border-border accent-primary"
                            />
                          </label>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={optionalForm.control}
                      name="autoLogin"
                      render={({ field }) => (
                        <FormItem>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors",
                              field.value
                                ? "border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15"
                                : "border-border bg-secondary/30 hover:bg-secondary/50"
                            )}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">Auto-login</p>
                                {field.value && (
                                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-500">
                                    Warning
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Skip login when behind external auth
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={(e) =>
                                handleAutoLoginToggle(e.target.checked)
                              }
                              className="h-5 w-5 rounded border-border accent-amber-500"
                            />
                          </label>
                        </FormItem>
                      )}
                    />

                    {optionalForm.watch("autoLogin") && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <p className="text-xs text-amber-500/90">
                          Auto-login is enabled. Make sure this server is
                          protected by an external authentication layer
                          (Authelia, Authentik, etc.)
                        </p>
                      </div>
                    )}

                    <FormField
                      control={optionalForm.control}
                      name="retentionDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data Retention (days)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormDescription>
                            How long to keep usage data before cleanup
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep("server")}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={saveOptionalMutation.isPending}
                      >
                        {saveOptionalMutation.isPending ? "Saving..." : "Continue"}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            )}

            {/* Complete Step */}
            {step === "complete" && (
              <div className="space-y-6 text-center">
                <div className="glow-success mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20">
                  <Check className="h-8 w-8 text-emerald-500" />
                </div>

                <div>
                  <h2 className="text-xl font-semibold">Setup Complete!</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your Claude Tracker is ready. Click below to access your
                    dashboard and start monitoring.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-secondary/30 p-4 text-left">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Next Steps
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Install the daemon on your machines
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Register devices to get API keys
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Connect Grafana for advanced dashboards
                    </li>
                  </ul>
                </div>

                <Button
                  onClick={() => completeSetupMutation.mutate()}
                  disabled={completeSetupMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {completeSetupMutation.isPending
                    ? "Finishing..."
                    : "Go to Dashboard"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Claude Tracker v1.0.0 • Made for homelabbers
          </p>
        </div>
      </div>
    </div>
  );
}
