export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("orderhub_token");
}

export function setToken(token: string) {
  localStorage.setItem("orderhub_token", token);
}

export function removeToken() {
  localStorage.removeItem("orderhub_token");
}

export async function authFetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 || response.status === 403) {
    removeToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }
  return response;
}
