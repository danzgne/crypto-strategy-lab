export function getPublicBackendUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  return typeof window === 'undefined'
    ? 'http://localhost:3100'
    : window.location.origin;
}
