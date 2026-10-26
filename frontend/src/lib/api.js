const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export async function apiRequest(path, { token, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error(`Could not reach the API at ${API_BASE}. Check that the backend is running and CORS allows this frontend origin.`);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.fields = data.fields || {};
    throw error;
  }
  return data;
}
