import { ApiError } from './apiError';

// Ensure NEXT_PUBLIC_BACKEND_URL is available for the browser client.
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3100';

export async function browserHttpClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

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
      message = data.error || message;
    } catch {
      // ignore JSON parse error
    }
    throw new ApiError(response.status, message);
  }

  // If it's a 204 No Content, return null
  if (response.status === 204) {
    return null as unknown as T;
  }

  return response.json();
}
