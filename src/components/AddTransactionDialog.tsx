
'use client';
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Sparkles } from "lucide-react";
import { Category, Transaction } from "@/lib/types";
import type { Settings } from "@/lib/types";
import { Switch } from "./ui/switch";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { AddCategoryDialog } from "./AddCategoryDialog";
import { useApp } from "@/contexts/AppContext";
import { useSupabase } from "@/lib/supabase/provider";
import { useDoc } from "@/hooks/use-supabase";
import { getCurrencySymbol } from "@/lib/currency";


interface AddTransactionDialogProps {
  addTransaction: (transaction: Omit<Transaction, "id" | "date" | "created_at" | "user_id">, autoCategorize: boolean) => void;
  categories: Category[];
}

export const AddTransactionDialog = ({ addTransaction, categories }: AddTransactionDialogProps) => {
  const { session } = useSupabase();
  const user = session?.user;
  const { addCategory } = useApp();
  const [open, setOpen] = useState(false);
  const [useAutoCategory, setUseAutoCategory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    merchant: "",
    amount: "",
    category: "",
    type: "debit" as "debit" | "credit",
    status: "completed" as "completed" | "pending",
    note: "",
    payment_method: "cash",
  });

  const { data: settings } = useDoc<Settings>(
    user ? `settings?user_id=eq.${user.id}` : null
  );

  useEffect(() => {
    if (settings) {
      setUseAutoCategory(settings.auto_categ);
    }
  }, [settings]);

  const handleAddCategory = (category: Omit<Category, "id" | "user_id" | "created_at">) => {
    addCategory(category);
    toast.success("Category added successfully!");
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.merchant || !formData.amount) {
      toast.error("Please fill in the merchant and amount.");
      return;
    }

    if (!useAutoCategory && !formData.category) {
      toast.error("Please select a category.");
      return;
    }

    setIsSubmitting(true);

    try {
      await addTransaction({
        merchant: formData.merchant,
        amount: parseFloat(formData.amount),
        category: formData.category || "Others",
        type: formData.type,
        status: formData.status,
        note: formData.note,
        payment_method: formData.payment_method,
      }, useAutoCategory);

      toast.success(`Transaction ${useAutoCategory ? 'auto-categorized and' : ''} added successfully!`);

      setOpen(false);
      setFormData({
        merchant: "",
        amount: "",
        category: "",
        type: "debit",
        status: "completed",

        note: "",
        payment_method: "cash",
      });

    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message || "Failed to add transaction.");
      } else {
        toast.error("Failed to add transaction.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Transaction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto w-full">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
          <DialogDescription>Add a new income or expense transaction.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {settings?.auto_categ && (
            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm bg-primary/5">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <Label htmlFor="auto-category-switch" className="font-semibold">Auto-Categorize</Label>
              </div>
              <Switch
                id="auto-category-switch"
                checked={useAutoCategory}
                onCheckedChange={setUseAutoCategory}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="merchant">Merchant/Description *</Label>
            <Input
              id="merchant"
              value={formData.merchant}
              onChange={(e) => setFormData({ ...formData, merchant: e.target.value })}
              placeholder="e.g., Amazon, Salary, etc."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground pointer-events-none">
                {getCurrencySymbol(settings?.currency)}
              </span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                className="pl-7"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Payment Method</Label>
            <PaymentMethodSelector
              value={formData.payment_method}
              onChange={(method) => setFormData({ ...formData, payment_method: method })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select value={formData.type} onValueChange={(value: "debit" | "credit") => setFormData({ ...formData, type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debit">Expense</SelectItem>
                <SelectItem value="credit">Income</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!useAutoCategory && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="category">Category</Label>
                <AddCategoryDialog
                  onAddCategory={handleAddCategory}
                  trigger={<Button type="button" variant="link" className="h-auto p-0 text-xs">+ New Category</Button>}
                />
              </div>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>

                <SelectContent>
                  {Array.from(new Map((categories || []).map(c => [c.name, c])).values())
                    .filter(c => c.name !== 'Others') // Filter out "Others" to avoid duplicate key
                    .map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  <SelectItem value="Others">Others</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={formData.status} onValueChange={(value: "completed" | "pending") => setFormData({ ...formData, status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note (Optional)</Label>
            <Textarea
              id="note"
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Add any additional details..."
              rows={3}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Transaction'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
