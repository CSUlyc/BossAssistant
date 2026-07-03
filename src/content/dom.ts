export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function sanitizeFontFamily(value: string): string {
  return value.replace(/[;:{}<>]/g, "").trim();
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function waitForElement<T>(getter: () => T | null, timeoutMs: number): Promise<T | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const element = getter();
    if (element) {
      return element;
    }
    await delay(250);
  }

  return null;
}

export function findVisibleButtonByText(
  texts: string[],
  root: ParentNode = document,
  shouldIgnore?: (element: HTMLElement) => boolean
): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("button,a,[role='button'],.btn,.boss-btn,[class*='btn']"));
  return candidates.find((element) => {
    if (shouldIgnore?.(element)) return false;
    const text = normalizeText(element.innerText || element.textContent || "");
    return isVisible(element) && texts.some((expected) => text === expected || text.includes(expected));
  }) ?? null;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}