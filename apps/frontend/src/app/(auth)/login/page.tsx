import React from 'react';
import Link from 'next/link';
import { LoginForm } from '../../../features/auth/components/LoginForm';

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50 text-gray-900">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-md border border-gray-100">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Sign In</h1>
          <p className="text-sm text-gray-500">
            Enter your credentials to access your lab account
          </p>
        </div>
        
        <div className="flex justify-center">
          <LoginForm />
        </div>

        <div className="text-center text-sm">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
