
'use client'
import { useEffect, useMemo, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, X } from "lucide-react";
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

const NOTIFICATION_THRESHOLD = 0.8; // 80%
const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'];

export const BudgetNotifier = () => {
  const { session, supabase } = useSupabase();
  const user = session?.user;
  const [triggeredBudget, setTriggeredBudget] = useState<Budget | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, number>>({});
  const hasFixedCurrency = useRef(false);

  const { data: budgetSettings } = useDoc<BudgetSettings>(
    user ? `budgets?user_id=eq.${user.id}` : null
  );

  const { data: categories } = useCollection<Category>(
    user ? `categories?user_id=eq.${user.id}` : null
  );

  const { data: expenses } = useCollection<Transaction>(
    user ? `transactions?select=*&user_id=eq.${user.id}` : null
  );

  const { data: settings, mutate: mutateSettings } = useDoc<Settings>(
    user ? `settings?select=*&user_id=eq.${user.id}` : null
  );

  // AUTO-FIX: If the database has an invalid/unsupported currency, correct it to INR
  useEffect(() => {
    if (!user || !settings || !supabase || hasFixedCurrency.current) return;
    if (settings.currency && !VALID_CURRENCIES.includes(settings.currency)) {
      hasFixedCurrency.current = true;
      supabase
        .from('settings')
        .update({ currency: 'INR' })
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (!error) {
            // Refetch settings so the UI updates immediately
            mutateSettings();
          }
        });
    }
  }, [user, settings, supabase, mutateSettings]);

  // Use the corrected currency or force INR if invalid
  const effectiveCurrency = useMemo(() => {
    if (!settings?.currency || !VALID_CURRENCIES.includes(settings.currency)) {
      return 'INR';
    }
    return settings.currency;
  }, [settings]);

  const currencySymbol = useMemo(
    () => getCurrencySymbol(effectiveCurrency),
    [effectiveCurrency]
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

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-24 left-4 right-4 z-[100] mx-auto max-w-sm"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
      >
        {/* Glass card */}
        <div className="relative rounded-2xl overflow-hidden border border-white/[0.12] bg-white/[0.06] backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.35)]">
          <div className="p-4">
            {/* Close */}
            <button
              onClick={handleDismiss}
              className="absolute right-3 top-3 h-7 w-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-white/60" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-xl bg-red-500/20 flex items-center justify-center">
                <Flame className="h-4.5 w-4.5 text-red-400" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white/90 tracking-wide">
                  {percent >= 100 ? 'Over Budget' : 'Budget Warning'}
                </p>
                <p className="text-[11px] text-white/40">{triggeredBudget.categoryName}</p>
              </div>
            </div>

            {/* Amount row */}
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-2xl font-bold text-white">{currencySymbol}{Math.min(spent, amount).toFixed(0)}</span>
              <span className="text-sm text-white/40">/ {currencySymbol}{amount.toFixed(0)}</span>
            </div>

            {/* Progress */}
            <div className="space-y-1.5">
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    percent >= 100
                      ? 'bg-red-400'
                      : percent >= 90
                      ? 'bg-amber-400'
                      : 'bg-blue-400'
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-white/35 font-medium">
                <span>{percent}% used</span>
                <span>Limit</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
