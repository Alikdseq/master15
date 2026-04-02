import axios, { type AxiosRequestConfig } from "axios";

const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const FALLBACK_API_BASE_URL = "http://localhost:8000/api";
const DOCKER_API_BASE_URL = "http://backend:8000/api";

// Только dev + compose: переключение localhost ↔ backend при сетевой ошибке.
// В production-сборке (npm run build) этого нельзя — в браузере `backend` не резолвится;
// при ошибке TLS (ERR_CERT_*) axios даёт Network Error и раньше уходили на backend:8000.
const ENABLE_DEV_API_HOST_FALLBACK =
  import.meta.env.DEV && (!ENV_API_BASE_URL || ENV_API_BASE_URL === "auto");

// If run via Docker Compose, host browser can't resolve `backend` hostname.
// In "auto" mode we try localhost first (browser runs on host), and on network error retry once with Docker hostname.
export const API_BASE_URL =
  !ENV_API_BASE_URL || ENV_API_BASE_URL === "auto" ? FALLBACK_API_BASE_URL : ENV_API_BASE_URL;

/** Origin сервера API (для ссылок на /media/ и т.п.) */
export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL, "http://localhost").origin;
  } catch {
    return "";
  }
})();

type MpAxiosMarkers = {
  __mp_skip_refresh_retry?: boolean;
  __mp_retry_fallback?: boolean;
  __mp_retry_refresh?: boolean;
};

type MpAxiosRequestConfig = AxiosRequestConfig & MpAxiosMarkers & { headers?: unknown; url?: string };

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

/** DRF-style { field: ["msg"] } or { detail: "..." } → одна строка для UI */
export function formatApiError(e: unknown): string {
  const d = (e as { response?: { data?: unknown } })?.response?.data;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && "detail" in d) {
    const det = (d as { detail: unknown }).detail;
    if (typeof det === "string") return det;
  }
  if (d && typeof d === "object") {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      if (k === "detail") continue;
      if (Array.isArray(v)) parts.push(`${k}: ${v.map(String).join(" ")}`);
      else if (v != null && typeof v === "object") parts.push(`${k}: ${JSON.stringify(v)}`);
      else parts.push(`${k}: ${String(v)}`);
    }
    if (parts.length) return parts.join("; ");
  }
  return "Запрос не выполнен";
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(baseURL?: string): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const trimmedBase = (baseURL ?? API_BASE_URL).replace(/\/+$/, "");
    const refreshUrl = `${trimmedBase}/auth/refresh/`;
    try {
      const resp = await axios.post(
        refreshUrl,
        {},
        {
          withCredentials: true,
        }
      );
      return resp.status === 200;
    } catch {
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const cfg = error?.config as MpAxiosRequestConfig | undefined;
    if (
      ENABLE_DEV_API_HOST_FALLBACK &&
      cfg &&
      !cfg.__mp_retry_fallback &&
      typeof cfg.baseURL === "string" &&
      (error?.message === "Network Error" || error?.code === "ERR_NAME_NOT_RESOLVED")
    ) {
      cfg.__mp_retry_fallback = true;
      cfg.baseURL = cfg.baseURL.includes("backend:8000") ? FALLBACK_API_BASE_URL : DOCKER_API_BASE_URL;
      return api.request(cfg);
    }

    // If access token is expired/invalid, try to refresh and repeat the original request once.
    if (
      cfg &&
      !cfg.__mp_retry_refresh &&
      !cfg.__mp_skip_refresh_retry &&
      error?.response?.status === 401 &&
      typeof cfg.url === "string" &&
      !cfg.url.includes("auth/token") &&
      !cfg.url.includes("auth/refresh") &&
      !cfg.url.includes("auth/logout")
    ) {
      cfg.__mp_retry_refresh = true;
      try {
        const refreshed = await refreshAccessToken(typeof cfg.baseURL === "string" ? cfg.baseURL : undefined);
        if (!refreshed) {
          window.dispatchEvent(new Event("mp_auth_lost"));
          return Promise.reject(error);
        }
        return api.request(cfg);
      } catch {
        window.dispatchEvent(new Event("mp_auth_lost"));
        return Promise.reject(error);
      }
    }

    // If refresh+retry didn't fix it, force logout to keep UI consistent.
    if (
      cfg &&
      cfg.__mp_retry_refresh &&
      error?.response?.status === 401 &&
      typeof cfg.url === "string" &&
      !cfg.url.includes("auth/token") &&
      !cfg.url.includes("auth/refresh") &&
      !cfg.url.includes("auth/logout")
    ) {
      window.dispatchEvent(new Event("mp_auth_lost"));
    }

    return Promise.reject(error);
  }
);

