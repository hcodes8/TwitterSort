export function observe(
  target: Element,
  callback: MutationCallback
) {
  const observer = new MutationObserver(callback)

  observer.observe(target, {
    childList: true,
    subtree: true
  })

  return observer
}