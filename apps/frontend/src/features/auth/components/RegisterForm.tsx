'use client';

import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function RegisterForm() {
  const { register, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await register({ email, password });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 w-full max-w-sm"
    >
      {error && (
        <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="p-2 border rounded-md"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="p-2 border rounded-md"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="mt-2 p-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
      >
        {isLoading ? 'Registering...' : 'Register'}
      </button>
    </form>
  );
}
