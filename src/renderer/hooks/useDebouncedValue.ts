import { useEffect, useState } from 'react'

/**
 * Returns a value that updates at most once per `delay` ms. Intended for
 * expensive filter/sort pipelines that react to typed input — without
 * debouncing, every keystroke re-scans the dataset (bestiary search over
 * 263 monsters, item/spell lists, etc).
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
