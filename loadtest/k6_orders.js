import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
};

const BASE = __ENV.BASE_URL || "http://127.0.0.1:8000/api";
const EMAIL = __ENV.EMAIL || "admin@example.com";
const PASSWORD = __ENV.PASSWORD || "Passw0rd123";

export function setup() {
  const res = http.post(
    `${BASE}/auth/token/`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "token ok": (r) => r.status === 200 });
  const data = res.json();
  return { token: data.access };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` };
  const r = http.get(`${BASE}/orders/?page=1`, { headers });
  check(r, { "orders 200": (x) => x.status === 200 });
  sleep(1);
}

