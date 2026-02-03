import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import type { UsageEntry, UsagePushResponse } from "@claude-code-prometheus/shared";

// Log to file for daemon mode
function logError(message: string): void {
  const logFile = "/tmp/claude-usage-daemon.error.log";
  const timestamp = new Date().toISOString();
  appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

// Send system notification (cross-platform)
function sendNotification(title: string, message: string): void {
  try {
    const platform = process.platform;

    if (platform === "darwin") {
      // macOS - use osascript
      const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
      execSync(`osascript -e '${script}'`, { stdio: "ignore" });
    } else if (platform === "linux") {
      // Linux - use notify-send if available
      try {
        execSync(`which notify-send`, { stdio: "ignore" });
        execSync(`notify-send "${title}" "${message}"`, { stdio: "ignore" });
      } catch {
        // notify-send not available, fall back to logging
        logError(`[NOTIFICATION] ${title}: ${message}`);
      }
    } else if (platform === "win32") {
      // Windows - use PowerShell toast notification
      const psScript = `
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $template = @"
        <toast>
          <visual>
            <binding template="ToastText02">
              <text id="1">${title}</text>
              <text id="2">${message}</text>
            </binding>
          </visual>
        </toast>
"@
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($template)
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Claude Usage Daemon").Show($toast)
      `;
      execSync(`powershell -Command "${psScript.replace(/\n/g, " ")}"`, { stdio: "ignore" });
    }
  } catch {
    // Silently fail if notification can't be sent
    logError(`[NOTIFICATION FAILED] ${title}: ${message}`);
  }
}

export interface ApiClientOptions {
  enableNotifications?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class ApiClient {
  private serverUrl: string;
  private apiKey: string;
  private queue: UsageEntry[] = [];
  private isSending = false;
  private enableNotifications: boolean;
  private maxRetries: number;
  private retryDelayMs: number;
  private consecutiveFailures = 0;
  private lastNotificationTime = 0;
  private notificationCooldownMs = 5 * 60 * 1000; // 5 minutes between notifications

  constructor(serverUrl: string, apiKey: string, options: ApiClientOptions = {}) {
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
    this.enableNotifications = options.enableNotifications ?? true;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 5000;
  }

  addEntries(entries: UsageEntry[]): void {
    this.queue.push(...entries);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  private shouldNotify(): boolean {
    if (!this.enableNotifications) return false;
    const now = Date.now();
    if (now - this.lastNotificationTime < this.notificationCooldownMs) return false;
    return true;
  }

  private notify(title: string, message: string): void {
    if (this.shouldNotify()) {
      this.lastNotificationTime = Date.now();
      sendNotification(title, message);
    }
  }

  async flush(): Promise<{ success: boolean; processed: number; error?: string }> {
    if (this.queue.length === 0 || this.isSending) {
      return { success: true, processed: 0 };
    }

    this.isSending = true;

    // Take all entries from queue
    const entriesToSend = [...this.queue];
    this.queue = [];

    let lastError: string | undefined;
    let attempt = 0;

    while (attempt < this.maxRetries) {
      attempt++;

      try {
        const response = await fetch(`${this.serverUrl}/api/usage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Device-Key": this.apiKey,
          },
          body: JSON.stringify({
            entries: entriesToSend,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as UsagePushResponse;
          this.consecutiveFailures = 0;
          this.isSending = false;
          return { success: true, processed: data.processed };
        }

        // Handle specific error codes
        if (response.status === 401) {
          lastError = "Authentication failed - invalid or expired API key";
          logError(`API Error: ${lastError}`);
          this.notify("Claude Usage Daemon", `Error: ${lastError}`);
          // Don't retry auth errors
          break;
        }

        if (response.status === 429) {
          lastError = "Rate limited - too many requests";
          logError(`API Error: ${lastError}`);
          // Wait longer before retry
          await new Promise((r) => setTimeout(r, this.retryDelayMs * 2));
          continue;
        }

        const errorText = await response.text();
        lastError = `Server error (${response.status}): ${errorText}`;
        logError(`API Error: ${lastError}`);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("ECONNREFUSED")) {
            lastError = "Cannot connect to server - is it running?";
          } else if (error.message.includes("ETIMEDOUT")) {
            lastError = "Connection timed out";
          } else if (error.message.includes("ENOTFOUND")) {
            lastError = "Server not found - check URL";
          } else {
            lastError = error.message;
          }
        } else {
          lastError = "Unknown error occurred";
        }
        logError(`Network Error (attempt ${attempt}/${this.maxRetries}): ${lastError}`);
      }

      // Wait before retry
      if (attempt < this.maxRetries) {
        await new Promise((r) => setTimeout(r, this.retryDelayMs));
      }
    }

    // All retries failed - put entries back in queue
    this.queue = [...entriesToSend, ...this.queue];
    this.consecutiveFailures++;
    this.isSending = false;

    // Send notification after multiple consecutive failures
    if (this.consecutiveFailures >= 3) {
      this.notify(
        "Claude Usage Daemon Error",
        `Failed to sync data after ${this.consecutiveFailures} attempts. ${lastError}`
      );
    }

    console.error(`Failed to push usage data after ${this.maxRetries} attempts: ${lastError}`);
    return { success: false, processed: 0, error: lastError };
  }

  // Test connection to server
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.serverUrl}/api/health`, {
        method: "GET",
        headers: {
          "X-Device-Key": this.apiKey,
        },
      });

      if (response.ok) {
        return { success: true };
      }

      if (response.status === 401) {
        return { success: false, error: "Invalid API key" };
      }

      return { success: false, error: `Server returned status ${response.status}` };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("ECONNREFUSED")) {
          return { success: false, error: "Cannot connect to server" };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: "Unknown error" };
    }
  }

  // Validate API key with server
  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.serverUrl}/api/usage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Key": this.apiKey,
        },
        body: JSON.stringify({ entries: [] }),
      });

      if (response.ok) {
        return { valid: true };
      }

      if (response.status === 401) {
        return { valid: false, error: "Invalid or expired API key" };
      }

      return { valid: true }; // Other errors don't mean the key is invalid
    } catch (error) {
      // Network errors don't mean the key is invalid
      return { valid: true, error: "Could not verify (network error)" };
    }
  }
}
