import { cookies } from 'next/headers';
import { ApiError } from './apiError';

// For server components, we fetch from the backend using the internal docker url if available
const BASE_URL = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3100';

export async function serverHttpClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('connect.sid');

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  
  if (sessionCookie) {
    headers.set('Cookie', `${sessionCookie.name}=${sessionCookie.value}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = 'API request failed';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return null as unknown as T;
  }

  return response.json();
}
