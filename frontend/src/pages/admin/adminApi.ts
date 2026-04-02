export function getResults<T = unknown>(data: unknown): T[] {
  if (data && typeof data === "object" && "results" in data && Array.isArray((data as { results: unknown }).results)) {
    return (data as { results: T[] }).results;
  }
  if (Array.isArray(data)) return data as T[];
  return [];
}

export function getCount(data: unknown): number {
  if (data && typeof data === "object" && "count" in data && typeof (data as { count: unknown }).count === "number") {
    return (data as { count: number }).count;
  }
  const rows = getResults(data);
  return rows.length;
}
