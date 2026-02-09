
'use client';

import { BudgetNotifier } from '@/components/BudgetNotifier';
import BiometricAuthGuard from '@/components/BiometricAuthGuard';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BiometricAuthGuard>
      <main className="mx-auto w-full max-w-7xl px-6 md:px-10 py-8">
        <BudgetNotifier />
        {children}
      </main>
      <div className="h-16" />
    </BiometricAuthGuard>
  );
}
