'use client';

import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import type { User } from '../types';

export function UserMenu({ user }: { user: User }) {
  const { logout, isLoading } = useAuth();

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4">
      <div className="flex items-center gap-2 px-2 text-sm text-slate-700">
        <UserIcon className="size-4 text-indigo-600" />
        <span className="truncate font-medium">{user.email}</span>
      </div>
      <button
        onClick={() => logout()}
        disabled={isLoading}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
      >
        <LogOut className="size-4" />
        Logout
      </button>
    </div>
  );
}
