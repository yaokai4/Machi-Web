"use client";

import { useEffect, useState } from "react";

/** Returns `value` updated only after it has stayed unchanged for `delay`ms. */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
