import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import type { ClaudeCodeEntry, UsageEntry } from "@claude-code-prometheus/shared";

export interface ParseResult {
  entries: UsageEntry[];
  newPosition: number;
}

export async function parseJSONLFile(
  filePath: string,
  startPosition: number = 0
): Promise<ParseResult> {
  const stats = statSync(filePath);

  // If file hasn't changed, skip
  if (stats.size <= startPosition) {
    return { entries: [], newPosition: startPosition };
  }

  const entries: UsageEntry[] = [];
  let currentPosition = 0;

  // Extract session ID and project from file path
  // Path format: ~/.claude/projects/{project}/{sessionId}.jsonl
  const pathParts = filePath.split("/");
  const fileName = pathParts[pathParts.length - 1];
  const sessionId = fileName?.replace(".jsonl", "") ?? "unknown";

  // Find project - it's the directory before the session file
  const projectIndex = pathParts.indexOf("projects");
  const projectPart = projectIndex !== -1 ? pathParts[projectIndex + 1] : undefined;
  const project = projectPart ? decodeURIComponent(projectPart) : "unknown";

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, {
      start: startPosition,
      encoding: "utf-8",
    });

    const rl = createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      currentPosition += Buffer.byteLength(line, "utf-8") + 1; // +1 for newline

      if (!line.trim()) return;

      try {
        const entry = JSON.parse(line) as ClaudeCodeEntry;

        // Only process assistant messages with usage data
        if (
          entry.type === "assistant" &&
          entry.message?.usage
        ) {
          const usage = entry.message.usage;

          entries.push({
            sessionId: entry.sessionId || sessionId,
            project,
            timestamp: entry.timestamp,
            type: entry.type,
            model: entry.model,
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            cacheCreationTokens: usage.cache_creation_input_tokens || 0,
            cacheReadTokens: usage.cache_read_input_tokens || 0,
            costUSD: entry.costUSD,
          });
        }
      } catch (error) {
        // Skip malformed lines
        console.error(`Error parsing line in ${filePath}:`, error);
      }
    });

    rl.on("close", () => {
      resolve({
        entries,
        newPosition: startPosition + currentPosition,
      });
    });

    rl.on("error", reject);
  });
}
