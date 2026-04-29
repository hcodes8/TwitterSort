export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T {
  let timeout: number

  return function (...args: any[]) {
    clearTimeout(timeout)

    timeout = window.setTimeout(() => {
      fn(...args)
    }, delay)
  } as T
}