
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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/contexts/AppContext';
import { getErrorMessage } from '@/lib/error';
import {
  useCollection,
  useDoc,
  addDocument,
} from '@/hooks/use-supabase';
import { useSupabase } from '@/lib/supabase/provider';
import { getCurrencySymbol } from '@/lib/currency';
import type { Budget, Category, Settings } from '@/lib/types';
import { ArrowLeft, FolderTree, Plus, Save } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';


const AddBudgetDialog = ({
  onAddBudget,
  currencySymbol,
}: {
  onAddBudget: (name: string, amount: number) => void;
  currencySymbol: string;
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!name.trim() || isNaN(numericAmount) || numericAmount <= 0) {
      toast.error(
        'Please enter a valid category name and a positive budget amount.'
      );
      return;
    }

    onAddBudget(name.trim(), numericAmount);
    toast.success(`Budget for "${name.trim()}" added.`);

    setName('');
    setAmount('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Budget
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a New Budget</DialogTitle>
          <DialogDescription>
            Create a new expense category and set a monthly budget for it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Category Name</Label>
            <Input
              id="category-name"
              placeholder="e.g. Health & Wellness"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget-amount">Budget Amount</Label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                {currencySymbol}
              </span>
              <Input
                id="budget-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  if (/^\d*\.?\d*$/.test(e.target.value)) {
                    setAmount(e.target.value);
                  }
                }}
                className="pl-7"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Add Budget</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Budgets = () => {
  const { session, supabase } = useSupabase();
  const user = session?.user;
  const [budgetValues, setBudgetValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const { data: categories } = useCollection<Category>(
    user ? `categories?select=*&user_id=eq.${user.id}` : null
  );

  const { data: budgetSettings } = useDoc<{ budgets: Record<string, number> }>(
    user ? `budgets?user_id=eq.${user.id}` : null
  );

  const { data: settings } = useDoc<Settings>(
    user ? `settings?user_id=eq.${user.id}` : null
  );
  const currencySymbol = useMemo(
    () => getCurrencySymbol(settings?.currency),
    [settings]
  );

  useEffect(() => {
    if (budgetSettings?.budgets) {
      const newBudgetValues: Record<string, string> = {};
      for (const [key, value] of Object.entries(budgetSettings.budgets)) {
        newBudgetValues[key] = String(value);
      }
      setBudgetValues(newBudgetValues);
    }
  }, [budgetSettings]);

  const handleBudgetChange = (categoryId: string, value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setBudgetValues((prev) => ({
        ...prev,
        [categoryId]: value,
      }));
    }
  };

  const handleAddBudget = async (name: string, amount: number) => {
    if (!user || !supabase) return;

    const newCategory = {
      name,
      icon: 'FolderTree',
      color: 'text-primary',
      bg_color: 'bg-primary/10',
      groups: [],
    } as any;

    try {
      const addedCategory = await addDocument('categories', newCategory) as Category;
      const newBudgetId = addedCategory.id;
      const newBudgetValues = { ...budgetValues, [newBudgetId]: String(amount) };
      setBudgetValues(newBudgetValues);
      await handleSaveBudgets(newBudgetValues);
    } catch (e) {
      toast.error("Failed to add new budget category.");
    }
  };

  const handleSaveBudgets = async (
    budgetsToUpdate?: Record<string, string>
  ) => {
    if (!user || !supabase) return;
    setIsSaving(true);

    const finalBudgetValues = budgetsToUpdate || budgetValues;
    const budgetsToSave: { [categoryId: string]: number } = {};

    for (const [key, value] of Object.entries(finalBudgetValues)) {
      const numericValue = parseFloat(value);
      if (!isNaN(numericValue) && numericValue >= 0) {
        budgetsToSave[key] = numericValue;
      }
    }

    try {
      const { error } = await supabase
        .from('budgets')
        .upsert({ user_id: user.id, budgets: budgetsToSave }, { onConflict: 'user_id' });

      if (error) throw error;
      toast.success('Budgets saved successfully!');
    } catch (error: unknown) {
      toast.error('Failed to save budgets.', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Manage Budgets"
        subtitle="Set monthly spending limits for your categories."
        action={
          <div className="flex items-center gap-2">
            <AddBudgetDialog
              onAddBudget={handleAddBudget}
              currencySymbol={currencySymbol}
            />
            <Button asChild variant="outline">
              <Link href="/dashboard/settings">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Settings
              </Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        {categories && categories.length > 0 ? (
          categories.map((category) => (
            <Card key={category.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${category.bg_color}`}>
                    <FolderTree className={`h-6 w-6 ${category.color}`} />
                  </div>
                  <Label
                    htmlFor={`budget-${category.id}`}
                    className="text-lg font-medium"
                  >
                    {category.name}
                  </Label>
                </div>
                <div className="flex items-center gap-2 w-32">
                  <span className="text-xl font-semibold text-muted-foreground">
                    {currencySymbol}
                  </span>
                  <Input
                    id={`budget-${category.id}`}
                    type="text"
                    inputMode="decimal"
                    value={budgetValues[category.id] || ''}
                    onChange={(e) =>
                      handleBudgetChange(category.id as any, e.target.value)
                    }
                    placeholder="0.00"
                    className="text-right text-lg font-bold"
                  />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-20 text-muted-foreground border border-dashed rounded-lg">
            <FolderTree className="mx-auto h-12 w-12 mb-4" />
            <h3 className="font-semibold text-lg">No categories found.</h3>
            <p className="text-sm mt-1">
              Add your first budget to get started.
            </p>
          </div>
        )}
      </div>

      {categories && categories.length > 0 && (
        <div className="mt-8 flex justify-end">
          <Button
            onClick={() => handleSaveBudgets()}
            disabled={isSaving}
            size="lg"
          >
            {isSaving ? (
              'Saving...'
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" /> Save Budgets
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
};

export default Budgets;
