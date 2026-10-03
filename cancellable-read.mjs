export function cancellableRead(api, url, onResult, onError, onSettled) {
  const controller = new AbortController()
  let current = true
  api(url, { signal: controller.signal })
    .then(result => { if (current) onResult(result) })
    .catch(error => { if (current) onError(error) })
    .finally(() => { if (current) onSettled() })
  return () => { current = false; controller.abort() }
}
