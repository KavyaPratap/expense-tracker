
'use client'
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
      // Check standard notification permissions
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

      // Send system notification if enabled
      if (settings?.notifications === true) {
        const spentAmount = next.spent || 0;
        const rawPercent = (spentAmount / (next.amount || 1)) * 100;
        const percentRaw = Math.min(100, Math.round(rawPercent));

        LocalNotifications.schedule({
          notifications: [
            {
              title: 'Budget Alert 🚨',
              body: `You've used ${percentRaw}% of your ${next.categoryName} budget.`,
              id: Math.floor(Math.random() * 100000), // Random ID to allow multiple
              schedule: { at: new Date(Date.now() + 1000) }, // 1 second delay
              smallIcon: 'ic_stat_notification', // fallback icon name
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
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        <Card className="border-0 shadow-2xl relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/90 via-orange-500/85 to-red-500/80 dark:from-amber-600/90 dark:via-orange-600/85 dark:to-red-600/80">
          {/* Glass shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/10 pointer-events-none" />
          
          <CardContent className="p-4 relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-8 w-8 text-white/70 hover:bg-white/20 hover:text-white"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="flex gap-3 mb-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>

              <div className="pr-6 min-w-0 flex-1">
                <h4 className="font-bold text-base mb-1 text-white leading-none">
                  Budget Alert
                </h4>
                <p className="text-[13px] text-white/85 leading-tight break-words">
                  You’ve spent <strong className="text-white">{currencySymbol}{Math.min(spent, amount).toFixed(2)}</strong> of <strong className="text-white">{currencySymbol}{amount.toFixed(2)}</strong> for <strong className="text-white">{triggeredBudget.categoryName}</strong>
                </p>
              </div>
            </div>

            <div className="mt-1">
              <div className="mb-1.5 flex justify-between text-[11px] font-semibold text-white/80 uppercase tracking-wider">
                <span>Spending Progress</span>
                <span>{percent}%</span>
              </div>
              <Progress
                value={percent}
                className="h-2 bg-white/20 [&>div]:bg-white"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};
