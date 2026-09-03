import { ApiError } from './apiError';
import { getPublicBackendUrl } from './publicBackendUrl';

export async function browserHttpClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${getPublicBackendUrl()}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    // Crucial for sending and receiving cookies cross-origin (or same-origin)
    credentials: 'include',
  });

  if (!response.ok) {
    let message = 'API request failed';
    try {
      const data = await response.json();
      message = data.error?.message || data.error || data.message || message;
    } catch {
      // ignore JSON parse error
    }
    throw new ApiError(response.status, message);
  }

  // If it's a 204 No Content, return null
  if (response.status === 204) {
    return null as unknown as T;
  }

  const json = await response.json();

  // Unwrap the ApiResponse envelope: { success: true, data: T }
  if (
    json &&
    typeof json === 'object' &&
    'success' in json &&
    json.success &&
    'data' in json
  ) {
    return json.data as T;
  }

  return json as T;
}
