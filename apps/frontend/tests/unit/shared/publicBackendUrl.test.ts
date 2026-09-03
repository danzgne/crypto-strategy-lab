import { afterEach, describe, expect, it } from 'vitest';

import { getPublicBackendUrl } from '../../../src/shared/api/publicBackendUrl';

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

afterEach(() => {
  if (originalBackendUrl === undefined) {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
  } else {
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  }
});

describe('getPublicBackendUrl', () => {
  it('prefers the explicitly configured backend URL', () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = 'http://localhost:3100';

    expect(getPublicBackendUrl()).toBe('http://localhost:3100');
  });

  it('uses the browser origin when the edge build leaves the URL empty', () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;

    expect(getPublicBackendUrl()).toBe(window.location.origin);
  });
});
