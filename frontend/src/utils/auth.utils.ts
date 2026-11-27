export const getAuthToken = (): string | null => typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
export const getCurrentUser = () => {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
};
export const addAuthHeader = (headers: HeadersInit = {}): HeadersInit => {
  const result = new Headers(headers);
  const token = getAuthToken();
  if (token) result.set("Authorization", `Bearer ${token}`);
  return result;
};
export const isAuthenticated = () => !!getAuthToken();
export const authFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const token = getAuthToken();
  const response = await fetch(input, { ...init, headers: addAuthHeader(init.headers) });
  if (response.status === 401 && typeof window !== "undefined" && getAuthToken() === token) window.dispatchEvent(new Event("auth:expired"));
  return response;
};
