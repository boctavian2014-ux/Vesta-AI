// FastAPI base URL (direct), not the SPA domain. Set EXPO_PUBLIC_API_URL for production builds.
const fromEnv = (process.env.EXPO_PUBLIC_API_URL || "").trim();
export const API_BASE_URL =
  fromEnv ||
  (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:8000" : "");
