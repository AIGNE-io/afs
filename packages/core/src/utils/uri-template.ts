/**
 * URI Template parser and builder.
 *
 * Supports AFS URI template variable syntax:
 * - {param}    — single segment (no /)
 * - {param+}   — multi-segment (greedy, may contain /)
 * - {param?}   — optional single segment
 * - {param+?}  — optional multi-segment (greedy)
 *
 * Disambiguation: non-greedy {param} consumes up to the next /;
 * greedy {param+} consumes all remaining segments.
 * In {a}/{b+?}, a takes the first segment, b takes the rest (if any).
 */

interface TemplateVariable {
  name: string;
  greedy: boolean;
  optional: boolean;
}

/**
 * Extract scheme from a URI template string.
 * e.g. "s3://{bucket}/{prefix+?}" → "s3"
 */
export function extractSchemeFromTemplate(template: string): string {
  const match = template.match(/^([a-z0-9][a-z0-9+.-]*):\/\//i);
  if (!match?.[1]) {
    throw new Error(`Invalid URI template: cannot extract scheme from "${template}"`);
  }
  return match[1].toLowerCase();
}

/**
 * Parse the variable definitions from a URI template's body part.
 */
function parseTemplateVariables(templateBody: string): TemplateVariable[] {
  const vars: TemplateVariable[] = [];
  const regex = /\{([^}]+)\}/g;
  for (const match of templateBody.matchAll(regex)) {
    const raw = match[1]!;
    let name = raw;
    let greedy = false;
    let optional = false;

    // Check for +? (greedy + optional)
    if (name.endsWith("+?")) {
      name = name.slice(0, -2);
      greedy = true;
      optional = true;
    } else if (name.endsWith("+")) {
      name = name.slice(0, -1);
      greedy = true;
    } else if (name.endsWith("?")) {
      name = name.slice(0, -1);
      optional = true;
    }

    vars.push({ name, greedy, optional });
  }

  return vars;
}

/**
 * Extract the body pattern from a URI template (everything after scheme://).
 */
function getTemplateBody(template: string): string {
  const idx = template.indexOf("://");
  if (idx < 0) {
    throw new Error(`Invalid URI template: missing "://" in "${template}"`);
  }
  return template.slice(idx + 3);
}

/**
 * Parse a URI body against a URI template, extracting named variables.
 *
 * @param template - URI template string, e.g. "s3://{bucket}/{prefix+?}"
 * @param body - URI body string, e.g. "my-bucket/a/b/c"
 * @returns Record of variable name → value. Optional vars may be undefined.
 * @throws if required variables cannot be extracted from body
 */
export function parseTemplate(template: string, body: string): Record<string, string | undefined> {
  const templateBody = getTemplateBody(template);
  const vars = parseTemplateVariables(templateBody);

  // If no variables, return empty
  if (vars.length === 0) {
    return {};
  }

  const result: Record<string, string | undefined> = {};

  const segments = body.split("/").filter((s) => s !== "");

  if (vars.length === 1) {
    // Single variable case — simplest
    const v = vars[0]!;
    if (body === "" || segments.length === 0) {
      if (v.optional) {
        result[v.name] = undefined;
      } else {
        throw new Error(`URI template "${template}" requires "${v.name}" but URI body is empty`);
      }
    } else {
      // For greedy or single, take the entire body
      result[v.name] = body;
    }
    return result;
  }

  // Multi-variable case
  // Strategy: non-greedy vars consume one segment each (up to next /).
  // Greedy var consumes all remaining segments.
  let segIdx = 0;

  for (let i = 0; i < vars.length; i++) {
    const v = vars[i]!;

    if (v.greedy) {
      // Greedy: consume all remaining segments
      const remaining = segments.slice(segIdx);
      if (remaining.length === 0) {
        if (v.optional) {
          result[v.name] = undefined;
        } else {
          throw new Error(`URI template "${template}" requires "${v.name}" but no segments remain`);
        }
      } else {
        result[v.name] = remaining.join("/");
        segIdx = segments.length;
      }
    } else {
      // Non-greedy: consume one segment
      if (segIdx < segments.length) {
        result[v.name] = segments[segIdx]!;
        segIdx++;
      } else if (v.optional) {
        result[v.name] = undefined;
      } else {
        throw new Error(`URI template "${template}" requires "${v.name}" but no segments remain`);
      }
    }
  }

  return result;
}

/**
 * Build a URI from a template and variable values.
 *
 * @param template - URI template string, e.g. "s3://{bucket}/{prefix+?}"
 * @param vars - Record of variable name → value
 * @returns Constructed URI string
 * @throws if required variables are missing
 */
export function buildURI(template: string, vars: Record<string, string | undefined>): string {
  const templateBody = getTemplateBody(template);
  const templateVars = parseTemplateVariables(templateBody);

  // No template variables — the template IS the final URI (fixed URI)
  if (templateVars.length === 0) {
    return template;
  }

  const scheme = extractSchemeFromTemplate(template);

  const parts: string[] = [];

  for (const v of templateVars) {
    const value = vars[v.name];
    if (value === undefined || value === "") {
      if (!v.optional) {
        throw new Error(
          `buildURI: required variable "${v.name}" is missing for template "${template}"`,
        );
      }
      // Skip optional vars with no value
    } else {
      parts.push(value);
    }
  }

  return `${scheme}://${parts.join("/")}`;
}

/**
 * Extract variable names that appear in a URI template.
 * Useful for determining which schema fields are "path variables".
 *
 * @param template - URI template string
 * @returns Array of variable names (without +, ?, +? modifiers)
 */
export function getTemplateVariableNames(template: string): string[] {
  const templateBody = getTemplateBody(template);
  return parseTemplateVariables(templateBody).map((v) => v.name);
}
