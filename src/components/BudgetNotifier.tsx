
'use client'
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSupabase } from "@/lib/supabase/provider";
import { useCollection, useDoc } from "@/hooks/use-supabase";
import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  Transaction,
  Category,
  Budget,
  BudgetSettings,
  Settings,
} from "@/lib/types";
import { getCurrencySymbol } from "@/lib/currency";
import { createClient } from "@/lib/supabase/client";

const NOTIFICATION_THRESHOLD = 0.8; // 80%
const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'];

export const BudgetNotifier = () => {
  const { session } = useSupabase();
  const user = session?.user;
  const [triggeredBudget, setTriggeredBudget] = useState<Budget | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, number>>({});

  const { data: budgetSettings } = useDoc<BudgetSettings>(
    user ? `budgets?user_id=eq.${user.id}` : null
  );

  const { data: categories } = useCollection<Category>(
    user ? `categories?user_id=eq.${user.id}` : null
  );

  const { data: expenses } = useCollection<Transaction>(
    user ? `transactions?select=*&user_id=eq.${user.id}` : null
  );

  const { data: settings } = useDoc<Settings>(
    user ? `settings?select=*&user_id=eq.${user.id}` : null
  );

  // AUTO-FIX: If the database has an invalid/unsupported currency, silently correct it to INR
  useEffect(() => {
    if (!user || !settings) return;
    if (settings.currency && !VALID_CURRENCIES.includes(settings.currency)) {
      const supabase = createClient();
      supabase
        .from('settings')
        .update({ currency: 'INR' })
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (!error) {
            // Force SWR to refetch settings
            window.location.reload();
          }
        });
    }
  }, [user, settings]);

  const currencySymbol = useMemo(
    () => getCurrencySymbol(settings?.currency),
    [settings]
  );

  const activeBudgets = useMemo<Budget[]>(() => {
    if (!budgetSettings?.budgets || !categories || !expenses) {
      return [];
    }

    return Object.entries(budgetSettings.budgets).map(
      ([categoryId, limit]) => {
        const category = categories.find(
          (c) => String(c.id) === categoryId
        );

        if (!category || limit <= 0) {
          return {
            id: categoryId,
            categoryName: "Unknown",
            amount: limit,
            spent: 0,
          };
        }

        const spent =
          expenses
            .filter(
              (e) =>
                e.type === "debit" &&
                e.category === category.name
            )
            .reduce((sum, e) => sum + e.amount, 0) ?? 0;

        return {
          id: categoryId,
          categoryName: category.name,
          amount: limit,
          spent,
        };
      }
    );
  }, [budgetSettings, categories, expenses]);

  useEffect(() => {
    const checkPermissions = async () => {
      if (settings?.notifications) {
        const status = await LocalNotifications.checkPermissions();
        if (status.display === 'prompt') {
          await LocalNotifications.requestPermissions();
        }
      }
    };
    checkPermissions();

    const next = activeBudgets.find((b) => {
      const spent = b.spent ?? 0;
      const dismissedSpent = dismissedAlerts[b.categoryName] || 0;
      return (
        b.amount > 0 &&
        spent / b.amount >= NOTIFICATION_THRESHOLD &&
        spent > dismissedSpent
      );
    });

    if (next) {
      setTriggeredBudget(next);

      if (settings?.notifications === true) {
        const spentAmount = next.spent || 0;
        const rawPercent = (spentAmount / (next.amount || 1)) * 100;
        const percentRaw = Math.min(100, Math.round(rawPercent));

        LocalNotifications.schedule({
          notifications: [
            {
              title: 'Budget Alert 🚨',
              body: `You've used ${percentRaw}% of your ${next.categoryName} budget.`,
              id: Math.floor(Math.random() * 100000),
              schedule: { at: new Date(Date.now() + 1000) },
              smallIcon: 'ic_stat_notification',
              actionTypeId: "",
              extra: null
            }
          ]
        }).catch(err => console.error("Error scheduling notification", err));
      }
    } else {
      setTriggeredBudget(null);
    }
  }, [activeBudgets, dismissedAlerts, settings]);

  const handleDismiss = () => {
    if (!triggeredBudget) return;

    setDismissedAlerts((prev) => ({
      ...prev,
      [triggeredBudget.categoryName]: triggeredBudget.spent || 0,
    }));
    setTriggeredBudget(null);
  };

  if (!triggeredBudget) return null;

  const spent = triggeredBudget.spent ?? 0;
  const amount = triggeredBudget.amount;
  const percent = Math.min(
    100,
    Math.round((spent / amount) * 100)
  );

  // Determine severity color
  const isOverBudget = percent >= 100;
  const isNearLimit = percent >= 90;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-24 left-4 right-4 z-[100] mx-auto max-w-sm"
        initial={{ opacity: 0, y: 60, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 60, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <div className="relative rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          {/* Gradient background */}
          <div className={`absolute inset-0 ${
            isOverBudget
              ? 'bg-gradient-to-r from-rose-600 via-red-500 to-orange-500'
              : isNearLimit
              ? 'bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-500'
              : 'bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500'
          }`} />
          
          {/* Decorative circles */}
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
          <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/5" />

          <div className="relative p-4">
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute right-3 top-3 h-6 w-6 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-white" />
            </button>

            {/* Top row: Icon + Title */}
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-8 w-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                {isOverBudget ? (
                  <TrendingUp className="h-4 w-4 text-white" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-white" />
                )}
              </div>
              <span className="font-bold text-white text-sm tracking-wide uppercase">
                {isOverBudget ? 'Over Budget!' : 'Budget Alert'}
              </span>
            </div>

            {/* Amount info */}
            <div className="mb-3">
              <p className="text-white/90 text-sm leading-relaxed">
                <span className="font-semibold text-white text-lg">{currencySymbol}{Math.min(spent, amount).toFixed(0)}</span>
                <span className="text-white/70"> of </span>
                <span className="font-semibold text-white">{currencySymbol}{amount.toFixed(0)}</span>
                <span className="text-white/70"> spent on </span>
                <span className="font-semibold text-white">{triggeredBudget.categoryName}</span>
              </p>
            </div>

            {/* Modern progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-bold text-white/70 uppercase tracking-widest">
                <span>Progress</span>
                <span>{percent}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-white"
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
