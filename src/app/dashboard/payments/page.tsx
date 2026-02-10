
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddTransactionDialog } from '@/components/AddTransactionDialog';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/contexts/AppContext';
import { useCollection, useDoc } from '@/hooks/use-supabase';
import { useSupabase } from '@/lib/supabase/provider';
import { getCurrencySymbol } from '@/lib/currency';
import type { Category, Group, Settings, Transaction } from '@/lib/types';
import {
  CreditCard,
  Smartphone,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';



const upiOptions = [
  { name: 'Google Pay', icon: Smartphone, scheme: 'tez://' },
  { name: 'PhonePe', icon: Wallet, scheme: 'phonepe://' },
  { name: 'Paytm', icon: CreditCard, scheme: 'paytmmp://' }, // Updated to paytmmp scheme
  { name: 'Any UPI App', icon: Wallet, scheme: 'upi://pay' },
];

const Payments = () => {
  const { addTransaction, deleteTransaction } = useApp();
  const { session } = useSupabase();
  const user = session?.user;

  const { data: transactions } = useCollection<Transaction>(
    user ? `transactions?user_id=eq.${user.id}` : null
  );

  const { data: categories } = useCollection<Category>(
    user ? `categories?user_id=eq.${user.id}` : null
  );

  const { data: settings } = useDoc<Settings>(
    user ? `settings?user_id=eq.${user.id}` : null
  );
  const currencySymbol = useMemo(
    () => getCurrencySymbol(settings?.currency),
    [settings]
  );

  const { data: groups } = useCollection<Group>(
    user ? `groups?member_ids=cs.{${user.id}}` : null
  );

  const groupMap = useMemo(() => {
    if (!groups) return new Map<string, string>();
    return new Map(groups.map((g) => [g.id, g.name]));
  }, [groups]);

  const handleDelete = (id: number) => {
    deleteTransaction(id);
    toast.success('Transaction deleted');
  };



  const handleOpenUPI = async (scheme: string) => {
    // If on web (mobile browser), directly try to open the scheme
    if (Capacitor.getPlatform() === 'web') {
      window.open(scheme, '_self');
      return;
    }

    try {
      // Try to open with AppLauncher directly first
      // This avoids false negatives from canOpenUrl on some Android versions
      await AppLauncher.openUrl({ url: scheme });
    } catch (e) {
      console.warn("Direct open failed, checking availability...", e);
      try {
        const { value } = await AppLauncher.canOpenUrl({ url: scheme });
        if (value) {
          // It says it can open, but openUrl failed. Try fallback to window location
          window.location.href = scheme;
        } else {
          toast.error('App not installed');
        }
      } catch (checkError) {
        // IF even check fails, try last resort
        window.location.href = scheme;
      }
    }
  };

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Manage transactions & methods"
        action={
          <AddTransactionDialog
            addTransaction={addTransaction}
            categories={categories || []}
          />
        }
      />

      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Quick Payments</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {upiOptions.map((opt) => {
            const Icon = opt.icon;
            // Define gradients for each option
            const gradientClass =
              opt.name === 'Google Pay' ? 'bg-gradient-to-br from-blue-500 to-green-500' :
                opt.name === 'PhonePe' ? 'bg-gradient-to-br from-purple-500 to-indigo-600' :
                  'bg-gradient-to-br from-cyan-400 to-blue-600';

            return (
              <AlertDialog key={opt.name}>
                <AlertDialogTrigger asChild>
                  <button className={`
                    group relative overflow-hidden rounded-2xl p-6 h-32
                    ${gradientClass}
                    text-white shadow-lg transition-all duration-300
                    hover:scale-105 hover:shadow-2xl hover:-translate-y-1
                  `}>
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                    <div className="absolute -right-4 -bottom-4 opacity-20 group-hover:scale-150 group-hover:rotate-12 transition-transform duration-500">
                      <Icon className="w-24 h-24" />
                    </div>

                    <div className="relative z-10 flex flex-col h-full justify-between items-start">
                      <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
                        <Icon className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="font-bold text-lg">{opt.name}</p>
                        <p className="text-xs text-white/80">Tap to pay</p>
                      </div>
                    </div>
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Open {opt.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will open the {opt.name} app on your device.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleOpenUPI(opt.scheme)}>
                      Open App
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!transactions?.length ? (
            <div className="text-center py-10 text-muted-foreground">
              <Wallet className="mx-auto h-8 w-8 mb-2" />
              No transactions yet
            </div>
          ) : (
            transactions.map((tx) => {
              const isGroupTx = !!tx.groupId;
              const groupName = tx.groupId ? groupMap.get(tx.groupId) : null;

              return (
                <div key={tx.id} className="p-3 border rounded-lg">
                  <div className="flex justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{tx.merchant}</p>
                        {tx.status && <Badge>{tx.status}</Badge>}
                      </div>

                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>{tx.date}</span>
                        {isGroupTx && groupName && (
                          <>
                            <span>•</span>
                            <Users className="h-3 w-3" />
                            <span>{groupName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <p
                        className={`font-bold ${tx.type === 'credit'
                          ? 'text-success'
                          : 'text-destructive'
                          }`}
                      >
                        {tx.type === 'credit' ? '+' : '-'}
                        {currencySymbol}
                        {tx.amount.toFixed(2)}
                      </p>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete transaction?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This action will permanently delete this transaction.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive"
                              onClick={() => handleDelete(tx.id as any)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {tx.note && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {tx.note}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default Payments;
