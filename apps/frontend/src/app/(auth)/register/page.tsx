import React from 'react';
import Link from 'next/link';
import { RegisterForm } from '../../../features/auth/components/RegisterForm';

export default function RegisterPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50 text-gray-900">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-md border border-gray-100">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Create an Account</h1>
          <p className="text-sm text-gray-500">
            Register to start building and backtesting strategies
          </p>
        </div>
        
        <div className="flex justify-center">
          <RegisterForm />
        </div>

        <div className="text-center text-sm">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
