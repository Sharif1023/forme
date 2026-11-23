import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/commerce/api";

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
export const failure = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Something went wrong. Please try again.";
export function useAdminData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason) => {
        if (reason instanceof ApiError && reason.status === 401)
          window.dispatchEvent(new Event("admin-session-expired"));
        if (active) setError(failure(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, loading, error, reload, setData };
}
