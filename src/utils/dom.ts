export function qs<T extends Element>(
  selector: string,
  parent: Document | Element = document
): T | null {
  return parent.querySelector(selector)
}

export function qsa<T extends Element>(
  selector: string,
  parent: Document | Element = document
): T[] {
  return Array.from(parent.querySelectorAll(selector))
}

export function getText(el?: Element | null): string {
  return el?.textContent?.trim() || ""
}