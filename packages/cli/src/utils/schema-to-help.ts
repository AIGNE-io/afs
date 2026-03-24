/**
 * Generate CLI help text from JSON Schema
 */

interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

interface InputSchema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

export interface HelpInfo {
  path: string;
  description?: string;
  parameters: Array<{
    name: string;
    type: string;
    description?: string;
    required: boolean;
    choices?: string[];
    default?: unknown;
  }>;
}

/**
 * Extract help information from action metadata
 */
export function extractHelpInfo(path: string, metadata?: Record<string, unknown>): HelpInfo | null {
  if (!metadata) return null;

  const description = metadata.description as string | undefined;
  const inputSchema = metadata.inputSchema as InputSchema | undefined;
  const required = (inputSchema?.required || metadata.required || []) as string[];

  const parameters: HelpInfo["parameters"] = [];

  if (inputSchema?.properties) {
    for (const [name, prop] of Object.entries(inputSchema.properties)) {
      parameters.push({
        name,
        type: prop.type || "any",
        description: prop.description,
        required: required.includes(name),
        choices: prop.enum,
        default: prop.default,
      });
    }
  }

  return {
    path,
    description,
    parameters,
  };
}

/**
 * Generate CLI help text from help info
 */
export function generateHelpText(help: HelpInfo): string {
  const lines: string[] = [];

  lines.push(`Usage: afs exec ${help.path} [options]`);
  lines.push("");

  if (help.description) {
    lines.push(help.description);
    lines.push("");
  }

  // Action Parameters section
  if (help.parameters.length > 0) {
    lines.push("Action Parameters:");

    for (const param of help.parameters) {
      const typeHint = `<${param.type}>`;
      const reqLabel = param.required ? "(required)" : "(optional)";

      let line = `  --${param.name} ${typeHint}`.padEnd(28);
      line += param.description || "";
      line += ` ${reqLabel}`;
      lines.push(line);

      if (param.choices) {
        lines.push(`${"".padEnd(28)}Choices: ${param.choices.join(", ")}`);
      }
      if (param.default !== undefined) {
        lines.push(`${"".padEnd(28)}Default: ${param.default}`);
      }
    }
    lines.push("");
  }

  // CLI Options section
  lines.push("CLI Options:");
  lines.push(`${"  --args <json>".padEnd(28)}Pass all arguments as JSON string`);
  lines.push(`${"  (stdin)".padEnd(28)}Pipe JSON arguments via stdin`);
  lines.push(`${"  --json".padEnd(28)}Output in JSON format`);
  lines.push(`${"  --yaml".padEnd(28)}Output in YAML format`);
  lines.push(`${"  --view <mode>".padEnd(28)}Output view mode (default, llm, human)`);
  lines.push(`${"  --help, -h".padEnd(28)}Show this help message`);
  lines.push("");

  lines.push("Arguments priority: CLI flags > stdin > --args");

  return lines.join("\n");
}

/**
 * Generate help text for an action from its metadata
 */
export function generateActionHelp(
  path: string,
  metadata?: Record<string, unknown>,
): string | null {
  const help = extractHelpInfo(path, metadata);
  if (!help) return null;
  return generateHelpText(help);
}
