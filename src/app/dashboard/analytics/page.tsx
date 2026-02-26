
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useCollection, useDoc } from '@/hooks/use-supabase';
import { useSupabase } from '@/lib/supabase/provider';
import { getCurrencySymbol, CurrencyIcon } from '@/lib/currency';
import type { Settings, Transaction } from '@/lib/types';
import {
  format,
  getDaysInMonth,
  getMonth,
  getYear,
  subMonths,
  parse,
} from 'date-fns';
import { Activity, ArrowLeft, Target, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';


const Analytics = () => {
  const { session } = useSupabase();
  const user = session?.user;

  const { data: expenses } = useCollection<Transaction>(
    user ? `transactions?select=*&user_id=eq.${user.id}` : null
  );

  const { data: settings } = useDoc<Settings>(
    user ? `settings?select=*&user_id=eq.${user.id}` : null
  );

  const currencySymbol = useMemo(
    () => getCurrencySymbol(settings?.currency),
    [settings]
  );

  const { expenseDistribution, trendData, insights, hasExpenses } = useMemo(() => {
    const safeExpenses = expenses || [];
    const hasExpenses = safeExpenses.length > 0;
    const now = new Date();
    const currentMonth = getMonth(now);
    const currentYear = getYear(now);
    const lastMonth = getMonth(subMonths(now, 1));
    const lastMonthYear = getYear(subMonths(now, 1));

    // --- Totals for This Month vs. Last Month ---
    let totalSpentThisMonth = 0;
    let totalSpentLastMonth = 0;
    let totalIncomeThisMonth = 0;
    const categoryTotals: Record<string, number> = {};

    safeExpenses.forEach((t) => {
      try {
        let transactionDate: Date;
        const cleanDate = t.date.trim();
        if (cleanDate.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
          transactionDate = parse(cleanDate, 'yyyy-MM-dd', new Date());
        } else if (cleanDate.match(/^\w{3}\s\d{1,2},\s\d{4}$/)) {
          transactionDate = parse(cleanDate, 'MMM d, yyyy', new Date());
        } else {
          transactionDate = new Date(cleanDate);
        }

        const transactionMonth = getMonth(transactionDate);
        const transactionYear = getYear(transactionDate);

        const isCurrentMonth =
          transactionMonth === currentMonth && transactionYear === currentYear;

        if (t.type === 'debit') {
          if (isCurrentMonth) {
            totalSpentThisMonth += t.amount;
            categoryTotals[t.category] =
              (categoryTotals[t.category] || 0) + t.amount;
          } else if (
            transactionMonth === lastMonth &&
            transactionYear === lastMonthYear
          ) {
            totalSpentLastMonth += t.amount;
          }
        } else if (t.type === 'credit' && isCurrentMonth) {
          totalIncomeThisMonth += t.amount;
        }
      } catch (e) {
        // Ignore invalid date formats
      }
    });

    // --- Top Spending Category ---
    let topCategory = 'N/A';
    let topCategoryAmount = 0;
    if (totalSpentThisMonth > 0 && Object.keys(categoryTotals).length > 0) {
      topCategory = Object.keys(categoryTotals).reduce(
        (a, b) => (categoryTotals[a] > categoryTotals[b] ? a : b),
        'N/A'
      );
      topCategoryAmount = categoryTotals[topCategory];
    }

    // --- Average Daily Spend ---
    const daysInCurrentMonth = getDaysInMonth(now);
    const avgDailySpend =
      totalSpentThisMonth > 0 ? totalSpentThisMonth / daysInCurrentMonth : 0;

    // --- Pie Chart: Expense Distribution for Current Month ---
    const colors = [
      'hsl(var(--chart-1))',
      'hsl(var(--chart-2))',
      'hsl(var(--chart-3))',
      'hsl(var(--chart-4))',
      'hsl(var(--chart-5))',
    ];

    const expenseDistribution = Object.entries(categoryTotals)
      .map(([name, value], index) => ({
        name,
        value:
          totalSpentThisMonth > 0
            ? Math.round((value / totalSpentThisMonth) * 100)
            : 0,
        color: colors[index % colors.length],
      }))
      .filter((item) => item.value > 0);

    // --- Line Chart: Spending Trend for Last 6 Months ---
    const monthlySpending: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(now, i);
      const monthKey = format(date, 'MMM yyyy');
      monthlySpending[monthKey] = 0;
    }

    safeExpenses.forEach((t) => {
      try {
        let transactionDate: Date;
        const cleanDate = t.date.trim();
        if (cleanDate.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
          transactionDate = parse(cleanDate, 'yyyy-MM-dd', new Date());
        } else if (cleanDate.match(/^\w{3}\s\d{1,2},\s\d{4}$/)) {
          transactionDate = parse(cleanDate, 'MMM d, yyyy', new Date());
        } else {
          transactionDate = new Date(cleanDate);
        }

        const monthKey = format(transactionDate, 'MMM yyyy');
        if (monthKey in monthlySpending) {
          if (t.type === 'debit') {
            monthlySpending[monthKey] += t.amount;
          } else if (t.type === 'credit') {
            monthlySpending[monthKey] -= t.amount;
          }
        }
      } catch (e) { /* ignore */ }
    });

    const trendData = Object.entries(monthlySpending).map(
      ([month, amount]) => ({ month: month.split(' ')[0], amount })
    );

    // --- Insights Cards ---
    let spendingChange = 0;
    if (totalSpentLastMonth > 0) {
      spendingChange = Math.round(
        ((totalSpentThisMonth - totalSpentLastMonth) / totalSpentLastMonth) * 100
      );
    } else if (totalSpentThisMonth > 0) {
      spendingChange = 100; // If nothing was spent last month, any spending is a 100% increase
    }

    return {
      expenseDistribution,
      trendData,
      insights: {
        spendingChange,
        netBalance: totalIncomeThisMonth - totalSpentThisMonth,
        topCategory,
        topCategoryAmount,
        avgDailySpend,
      },
      hasExpenses,
    };
  }, [expenses]);

  const SpendingChangeIcon =
    insights.spendingChange >= 0 ? TrendingUp : TrendingDown;
  const spendingChangeColor =
    insights.spendingChange >= 0 ? 'text-destructive' : 'text-success';
  const netBalanceColor =
    insights.netBalance >= 0 ? 'text-success' : 'text-destructive';
  const NetBalanceIcon = insights.netBalance >= 0 ? TrendingUp : TrendingDown;

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Track your spending patterns"
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">
                Spending vs Last Month
              </p>
              <SpendingChangeIcon
                className={`h-4 w-4 ${spendingChangeColor}`}
              />
            </div>
            <p className={`text-2xl font-bold ${spendingChangeColor}`}>
              {insights.spendingChange >= 0 ? '+' : ''}
              {insights.spendingChange}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">
                Net Balance This Month
              </p>
              <NetBalanceIcon className={`h-4 w-4 ${netBalanceColor}`} />
            </div>
            <p className={`text-2xl font-bold flex items-center ${netBalanceColor}`}>
              <CurrencyIcon currency={settings?.currency} className="h-6 w-6 mr-1" />
              {insights.netBalance.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {hasExpenses && (
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Monthly Insights
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">
                    Top Spending Category
                  </p>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-lg font-bold">{insights.topCategory}</p>
                <p className="text-sm font-semibold text-primary flex items-center">
                  <CurrencyIcon currency={settings?.currency} className="h-3 w-3 mr-1" />
                  {insights.topCategoryAmount.toFixed(2)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">Avg. Daily Spend</p>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-lg font-bold flex items-center">
                  <CurrencyIcon currency={settings?.currency} className="h-5 w-5 mr-1" />
                  {insights.avgDailySpend.toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">this month</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {hasExpenses ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Expense Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={expenseDistribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {expenseDistribution.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spending Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData}>
                  <XAxis
                    dataKey="month"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `${currencySymbol}${v}`}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(v: number) => [
                      `${currencySymbol}${v.toFixed(2)}`,
                      'Spent',
                    ]}
                  />
                  <Line
                    dataKey="amount"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">
              No spending data available to display analytics.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
};

export default Analytics;
