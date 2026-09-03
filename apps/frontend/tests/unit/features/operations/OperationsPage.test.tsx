import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import OperationsPage from '../../../../src/app/(dashboard)/admin/operations/page';
import { authServer } from '../../../../src/features/auth/api/authServer';

const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
  usePathname: () => '/admin/operations',
}));

vi.mock('../../../../src/features/operations', () => ({
  OperationsDashboard: () => (
    <div data-testid="mock-operations-dashboard">Dashboard</div>
  ),
}));

describe('OperationsPage Server Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects to /login when user is not authenticated', async () => {
    vi.spyOn(authServer, 'getCurrentUser').mockResolvedValue(null);

    await OperationsPage();

    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('renders restricted access view when user is not ADMIN', async () => {
    vi.spyOn(authServer, 'getCurrentUser').mockResolvedValue({
      email: 'regular@crypto.lab',
      id: 'user-1',
      role: 'USER',
    });

    const jsx = await OperationsPage();
    render(jsx);

    expect(
      screen.getByTestId('operations-forbidden-server-check'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Administrator Privileges Required/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-operations-dashboard'),
    ).not.toBeInTheDocument();
  });

  it('renders OperationsDashboard when user is ADMIN', async () => {
    vi.spyOn(authServer, 'getCurrentUser').mockResolvedValue({
      email: 'admin@crypto.lab',
      id: 'admin-1',
      role: 'ADMIN',
    });

    const jsx = await OperationsPage();
    render(jsx);

    expect(screen.getByTestId('mock-operations-dashboard')).toBeInTheDocument();
  });
});
