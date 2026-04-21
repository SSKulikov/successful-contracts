import { useCallback, useState } from "react";

export function useSingleFlight() {
  const [inFlightKeys, setInFlightKeys] = useState<Record<string, boolean>>({});

  const runSingleFlight = useCallback(async <T>(key: string, action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlightKeys[key]) {
      return undefined;
    }
    setInFlightKeys((prev) => ({ ...prev, [key]: true }));
    try {
      return await action();
    } finally {
      setInFlightKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [inFlightKeys]);

  const isSingleFlight = useCallback((key: string) => Boolean(inFlightKeys[key]), [inFlightKeys]);

  return { runSingleFlight, isSingleFlight };
}
