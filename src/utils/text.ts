/** Hoisted so the same instance is reused (avoid recreating on every call). */
const THINK_TAGS_REGEX = /<think>|<\/think>/g;

/** Hoisted for reuse in hot paths (e.g. streaming summary updates). */
const MULTI_NEWLINE_REGEX = /\n{2,}/g;

/**
 * Strips <think>...</think> tags from model output.
 */
export function cleanThinkTags(str: string): string {
  return str.replace(THINK_TAGS_REGEX, "");
}

/**
 * Collapses multiple newlines to a single newline.
 */
export function normalizeNewlines(str: string): string {
  return str.replace(MULTI_NEWLINE_REGEX, "\n");
}
