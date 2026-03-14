
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
import type { Category, Group, Settings, Transaction } from '@/lib/types';
import { getCurrencySymbol } from '@/lib/currency';
import {
  CreditCard,
  Smartphone,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';


const upiOptions = [
  { name: 'Google Pay', icon: Smartphone, scheme: 'gpay://' },
  { name: 'PhonePe', icon: Wallet, scheme: 'phonepe://' },
  { name: 'Paytm', icon: CreditCard, scheme: 'paytmmp://' },
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

  const handleOpenUPI = (scheme: string) => {
    window.location.href = scheme;
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Quick Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upiOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <AlertDialog key={opt.name}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3 py-5"
                  >
                    <Icon className="h-6 w-6" />
                    <span className="font-semibold">{opt.name}</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Open {opt.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will attempt to open the app.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleOpenUPI(opt.scheme)}>
                      Proceed
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            );
          })}
        </CardContent>
      </Card>

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
                        className={`font-bold ${
                          tx.type === 'credit'
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
