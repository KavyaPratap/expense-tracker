
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
  const [dismissedCategories, setDismissedCategories] = useState<string[]>([]);

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
      return (
        b.amount > 0 &&
        spent / b.amount >= NOTIFICATION_THRESHOLD &&
        !dismissedCategories.includes(b.categoryName)
      );
    });

    if (next) {
      setTriggeredBudget(next);

      // Send system notification if enabled
      if (settings?.notifications === true) {
        const spentAmount = next.spent || 0;
        const percent = ((spentAmount / (next.amount || 1)) * 100).toFixed(0);

        LocalNotifications.schedule({
          notifications: [
            {
              title: 'Budget Alert 🚨',
              body: `You've used ${percent}% of your ${next.categoryName} budget.`,
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
  }, [activeBudgets, dismissedCategories, settings]);

  const handleDismiss = () => {
    if (!triggeredBudget) return;

    setDismissedCategories((prev) => [
      ...prev,
      triggeredBudget.categoryName,
    ]);
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
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        <Card className="border-warning/50 bg-warning/10 shadow-xl">
          <CardContent className="p-4 relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="flex gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/20">
                <AlertTriangle className="h-6 w-6 text-warning" />
              </div>

              <div className="flex-1">
                <h4 className="font-bold">Budget Alert</h4>
                <p className="text-sm text-muted-foreground">
                  You’ve spent{" "}
                  <strong>{currencySymbol}{spent.toFixed(2)}</strong> of{" "}
                  <strong>{currencySymbol}{amount.toFixed(2)}</strong> for{" "}
                  <strong>{triggeredBudget.categoryName}</strong>
                </p>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs">
                <span>Spending Progress</span>
                <span>{percent}%</span>
              </div>
              <Progress
                value={percent}
                className="h-2 [&>div]:bg-warning"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};
