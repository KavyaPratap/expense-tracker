
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
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        <Card className="bg-background dark:bg-[#1C1C1E] border border-warning/50 shadow-2xl relative overflow-hidden rounded-xl">
          {/* Subtle colored tint on top of background */}
          <div className="absolute inset-0 bg-warning/10 pointer-events-none" />
          
          <CardContent className="p-4 relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:bg-warning/10 hover:text-foreground"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="flex gap-4 mb-2">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-warning/20">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>

              <div className="pr-6 w-[calc(100%-3rem)]">
                <h4 className="font-semibold text-base mb-1 text-foreground leading-none">
                  Budget Alert
                </h4>
                <p className="text-[13px] text-muted-foreground leading-tight break-words pr-2">
                  You’ve spent <strong className="text-foreground">{currencySymbol}{Math.min(spent, amount).toFixed(2)}</strong> of <strong className="text-foreground">{currencySymbol}{amount.toFixed(2)}</strong> for <strong className="text-foreground">{triggeredBudget.categoryName}</strong>
                </p>
              </div>
            </div>

            <div className="mt-2">
              <div className="mb-1.5 flex justify-between text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Spending Progress</span>
                <span>{percent}%</span>
              </div>
              <Progress
                value={percent}
                className="h-2 bg-warning/20 [&>div]:bg-warning"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};
