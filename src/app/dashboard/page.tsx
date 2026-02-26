'use client';

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingDown, Search,
  SlidersHorizontal,
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
  MoreHorizontal, TrendingUp, RotateCcw
} from 'lucide-react';
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { useApp } from "@/contexts/AppContext";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSupabase } from "@/lib/supabase/provider";
import { getCurrencySymbol, CurrencyIcon } from "@/lib/currency";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { subDays, format, isWithinInterval, parse, getDaysInMonth, startOfWeek, endOfWeek } from 'date-fns';
import { BudgetNotifier } from "@/components/BudgetNotifier";
import Link from "next/link";
import { useCollection, useDoc } from "@/hooks/use-supabase";
import type { Transaction, Settings, Category, BudgetSettings } from "@/lib/types";


const getPaymentIcon = (method?: string) => {
  switch (method) {
    case 'card': return <CreditCard className="h-3 w-3" />;
    case 'gpay':
    case 'phonepe':
    case 'paytm':
      return <Smartphone className="h-3 w-3" />;
    case 'cash': return <Banknote className="h-3 w-3" />;
    default: return <MoreHorizontal className="h-3 w-3" />;
  }
};

const Dashboard = () => {
  const { addTransaction, deleteTransaction } = useApp();
  const { session } = useSupabase();
  const user = session?.user;

  const { data: transactions } = useCollection<Transaction>(
    user ? `transactions?select=*&user_id=eq.${user.id}` : null
  );

  const { data: categories } = useCollection<Category>(
    user ? `categories?select=*&user_id=eq.${user.id}` : null
  );

  const { data: settings } = useDoc<Settings>(
    user ? `settings?select=*&user_id=eq.${user.id}` : null
  );

  const { data: budgetSettings } = useDoc<BudgetSettings>(
    user ? `budgets?select=*&user_id=eq.${user.id}` : null
  );

  const currencySymbol = useMemo(
    () => getCurrencySymbol(settings?.currency),
    [settings]
  );

  const {
    todaySpend,
    weeklyData,
    monthTotal,
    savedAmount,
    todaysTransactions,
    budgetDifference,
    isOverBudget
  } = useMemo(() => {
    const tx = transactions || [];
    const today = new Date();
    const todayStr_MMM = format(today, 'MMM d, yyyy');
    const todayStr_ISO = format(today, 'yyyy-MM-dd');

    const todaysTransactions = tx.filter((t) => t.date === todayStr_MMM || t.date === todayStr_ISO);
    const todaySpend = todaysTransactions
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0);
    const sevenDaysAgo = subDays(today, 6);
    const weeklyData = Array.from({ length: 7 }).map((_, i) => {
      const date = subDays(today, 6 - i);
      return {
        day: format(date, 'EEE'),
        fullDate: format(date, 'MMM d, yyyy'),
        amount: 0,
      };
    });
    let totalWeeklySpend = 0;
    const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
    const endOfThisWeek = endOfWeek(today, { weekStartsOn: 1 });
    tx.forEach(transaction => {
      try {
        // Robust date parsing: try multiple formats
        let transactionDate: Date;
        if (transaction.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          transactionDate = parse(transaction.date, 'yyyy-MM-dd', new Date());
        } else {
          transactionDate = parse(transaction.date, 'MMM d, yyyy', new Date());
        }

        if (isNaN(transactionDate.getTime())) throw new Error("Invalid date");

        if (isWithinInterval(transactionDate, { start: sevenDaysAgo, end: today })) {
          const weekDayEntry = weeklyData.find(d => d.fullDate === format(transactionDate, 'MMM d, yyyy'));
          if (weekDayEntry) {
            if (transaction.type === 'debit') {
              weekDayEntry.amount += transaction.amount;
            } else if (transaction.type === 'credit') {
              weekDayEntry.amount -= transaction.amount;
            }
          }
        }
        if (isWithinInterval(transactionDate, { start: startOfThisWeek, end: endOfThisWeek })) {
          if (transaction.type === 'debit') {
            totalWeeklySpend += transaction.amount;
          }
        }
      } catch (e) { /* Ignore invalid dates */ }
    });
    let budgetDifference = 0;
    let isOverBudget = false;
    if (budgetSettings?.budgets && Object.keys(budgetSettings.budgets).length > 0) {
      const totalMonthlyBudget = Object.values(budgetSettings.budgets).reduce((sum, amount) => sum + amount, 0);
      const daysInCurrentMonth = getDaysInMonth(today);
      const totalWeeklyBudget = (totalMonthlyBudget / daysInCurrentMonth) * 7;
      if (totalWeeklyBudget > 0) {
        budgetDifference = Math.round(((totalWeeklySpend - totalWeeklyBudget) / totalWeeklyBudget) * 100);
        isOverBudget = totalWeeklySpend > totalWeeklyBudget;
      }
    }
    const monthTotal = tx
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0);
    const income = tx
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);
    const savedAmount = income - monthTotal;
    return {
      todaySpend,
      weeklyData,
      monthTotal,
      savedAmount,
      todaysTransactions,
      budgetDifference,
      isOverBudget,
    };
  }, [transactions, budgetSettings]);

  const handleResetToday = () => {
    if (todaysTransactions.length === 0) {
      toast.info("No transactions to reset for today.");
      return;
    }
    todaysTransactions.forEach((tx) => deleteTransaction(tx.id));
    toast.success("Today's transactions have been reset.");
  };

  const hasBudgets = budgetSettings && Object.keys(budgetSettings.budgets).length > 0;

  return (
    <>
      <PageHeader
        title="SmartSpend"
        subtitle="Track your expenses effortlessly"
        action={
          <AddTransactionDialog
            addTransaction={addTransaction}
            categories={categories || []}
          />
        }
      />

      <Card className="mb-6 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Today's Spend</CardTitle>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  disabled={todaysTransactions.length === 0}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Today's Spending?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all transactions recorded today. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetToday} className="bg-destructive hover:bg-destructive/90">
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-4xl font-bold flex items-center">
              <CurrencyIcon currency={settings?.currency} className="h-8 w-8 mr-1" />
              {todaySpend.toFixed(2)}
            </span>
            {hasBudgets && (
              <div className={`flex items-center gap-1 ${isOverBudget ? 'text-destructive' : 'text-success'}`}>
                {isOverBudget ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span className="text-sm font-semibold">
                  {Math.abs(budgetDifference)}%
                </span>
              </div>
            )}
          </div>
          {hasBudgets ? (
            <div className={`flex items-center gap-2 px-3 py-2 ${isOverBudget ? 'bg-destructive/10' : 'bg-success/10'} rounded-lg`}>
              {isOverBudget ? <TrendingUp className="h-4 w-4 text-destructive" /> : <TrendingDown className="h-4 w-4 text-success" />}
              <p className={`text-sm ${isOverBudget ? 'text-destructive' : 'text-success'}`}>
                You're {Math.abs(budgetDifference)}% {isOverBudget ? 'over' : 'under'} budget this week
              </p>
            </div>
          ) : (
            <Link href="/dashboard/budgets" className="block">
              <div className="flex items-center gap-2 px-3 py-2 bg-secondary/70 rounded-lg text-secondary-foreground hover:bg-secondary transition-colors">
                <p className="text-sm">No budgets set. Click to manage your budgets.</p>
              </div>
            </Link>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">Weekly Spending Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="hsl(var(--primary))" offset="5%" stopOpacity={0.3} />
                  <stop stopColor="hsl(var(--primary))" offset="95%" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis
                tickLine={false}
                axisLine={false}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(v) => `${currencySymbol}${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                }}
                formatter={(v: number) => [`${currencySymbol}${v.toFixed(2)}`, "Spent"]}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#colorAmount)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">This Month</p>
            <p className="text-2xl font-bold flex items-center">
              <CurrencyIcon currency={settings?.currency} className="h-6 w-6 mr-1" />
              {monthTotal.toFixed(2)}
            </p>
            <div className="flex items-center gap-1 mt-2 text-destructive">
              <TrendingUp className="h-3 w-3" />
              <span className="text-xs">Total spent</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Saved</p>
            <p className="text-2xl font-bold flex items-center">
              <CurrencyIcon currency={settings?.currency} className="h-6 w-6 mr-1" />
              {Math.max(0, savedAmount).toFixed(2)}
            </p>
            <div className="flex items-center gap-1 mt-2 text-success">
              <TrendingDown className="h-3 w-3" />
              <span className="text-xs">Balance</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <BudgetNotifier />

      <div className="mt-8 mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Recent Transactions</h2>
        <Link href="/dashboard/analytics" className="text-sm text-primary hover:underline">
          View All
        </Link>
      </div>

      <div className="space-y-3 mb-8">
        {(transactions || []).length > 0 ? (
          transactions!
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .slice(0, 5)
            .map((tx) => (
              <Card key={tx.id} className="hover:bg-muted/50 transition-colors">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full ${tx.type === 'debit' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                      {tx.type === 'debit' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-semibold">{tx.merchant}</p>
                      <p className="text-xs text-muted-foreground">{tx.date} • {tx.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-bold flex items-center ${tx.type === 'debit' ? 'text-destructive' : 'text-success'}`}>
                      {tx.type === 'debit' ? '-' : '+'}
                      <CurrencyIcon currency={settings?.currency} className="h-3 w-3 mx-0.5" />
                      {tx.amount.toFixed(2)}
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this transaction for "{tx.merchant}"?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteTransaction(tx.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              No transactions yet. Add your first one above!
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
};

export default Dashboard;
