import { API_BASE_URL } from "../lib/api";

/** ws://host/ws/crm/?token=... на том же хосте, что и REST API. */
export function buildCrmWebSocketUrl(accessToken?: string | null): string {
  const u = new URL(API_BASE_URL, typeof window !== "undefined" ? window.location.href : "http://localhost/");
  const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
  if (accessToken) {
    return `${wsProto}//${u.host}/ws/crm/?token=${encodeURIComponent(accessToken)}`;
  }
  return `${wsProto}//${u.host}/ws/crm/`;
}
