
'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Card, CardContent } from '@/components/ui/card';
import { AddCategoryDialog } from '@/components/AddCategoryDialog';
import { PageHeader } from '@/components/PageHeader';
import { useCollection, useDoc } from '@/hooks/use-supabase';
import { useSupabase } from '@/lib/supabase/provider';
import { getCurrencySymbol, CurrencyIcon } from '@/lib/currency';
import type { Category, Settings, Transaction } from '@/lib/types';
import {
  FolderTree,
  Trash2,
  TrendingDown,
  TrendingUp,
  Sparkles,
  MoreHorizontal,
} from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { createClient } from '@/lib/supabase/client';

const Categories = () => {
  const { addCategory, deleteCategory } = useApp();
  const { session } = useSupabase();
  const user = session?.user;
  const supabase = createClient();

  const { data: categories } = useCollection<Category>(
    user ? `categories?select=*&user_id=eq.${user.id}` : null
  );

  const { data: transactions } = useCollection<Transaction>(
    user ? `transactions?select=*&user_id=eq.${user.id}` : null
  );

  const { data: settings } = useDoc<Settings>(
    user ? `settings?select=*&user_id=eq.${user.id}` : null
  );

  const currencySymbol = useMemo(
    () => getCurrencySymbol(settings?.currency),
    [settings]
  );

  const handleDelete = (id: number, name: string) => {
    deleteCategory(id);
  };

  const handleAddCategory = (category: Omit<Category, "id" | "user_id" | "created_at">) => {
    addCategory(category);
    toast.success('Category added successfully!');
  };

  const defaultOpenIds = useMemo(() => {
    if (!categories) return [];
    return categories.map((category) => `item-${category.id}`);
  }, [categories]);

  return (
    <>
      <PageHeader
        title="Categories & Groups"
        subtitle="Organize your expenses"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const { error } = await supabase.rpc('cleanup_duplicate_categories');
                if (error) {
                  if (error.code === 'PGRST202') {
                    toast.error("Database Update Required", {
                      description: "Please run the 'fix_categories.sql' script in Supabase SQL Editor.",
                      duration: 10000
                    });
                  } else {
                    toast.error("Failed to cleanup duplicates", { description: error.message });
                  }
                } else {
                  toast.success("Duplicates merged successfully!");
                  window.location.reload();
                }
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Fix Duplicates
            </Button>
            <AddCategoryDialog onAddCategory={handleAddCategory} />
          </div>
        }
      />

      <div className="space-y-4 mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Categories
        </h2>

        {((categories && categories.length > 0) || (transactions && transactions.length > 0)) ? (
          <div className="w-full space-y-2">
            {(categories || []).map((category) => {
              const categoryTransactions = (transactions || []).filter(
                (t) => t.category === category.name
              );

              return (
                <Card
                  key={category.id}
                  className="shadow-sm hover:shadow-md transition-shadow duration-300"
                >
                  <Accordion
                    type="multiple"
                    defaultValue={defaultOpenIds}
                    className="w-full"
                  >
                    <AccordionItem
                      value={`item-${category.id}`}
                      className="border-none"
                    >
                      <div className="flex items-center p-4">
                        <div className={`p-3 rounded-xl ${category.bg_color}`}>
                          <FolderTree className={`h-6 w-6 ${category.color}`} />
                        </div>
                        <div className="flex-1 ml-4">
                          <h3 className="font-semibold text-lg">
                            {category.name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {categoryTransactions.length} transactions
                          </p>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              disabled={category.name === 'Others'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete "{category.name}"?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the category and reassign all its transactions to "Others". This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive hover:bg-destructive/90"
                                onClick={() =>
                                  handleDelete(
                                    category.id as any,
                                    category.name
                                  )
                                }
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>

                      <div className="flex flex-wrap gap-2 px-4 pb-2">
                        {(category.groups || []).map((group) => (
                          <Badge
                            key={group}
                            variant="secondary"
                            className="text-xs"
                          >
                            {group}
                          </Badge>
                        ))}
                      </div>

                      {categoryTransactions.length > 0 && (
                        <>
                          <AccordionTrigger className="text-sm py-2 px-4 hover:no-underline justify-start gap-1">
                            View Transactions
                          </AccordionTrigger>
                          <AccordionContent className="px-2 pb-2">
                            <Card className="bg-muted/50 shadow-inner">
                              <CardContent className="p-2 space-y-2">
                                {categoryTransactions.map((tx) => (
                                  <div
                                    key={tx.id}
                                    className="flex items-center justify-between text-sm p-2 rounded-md bg-background"
                                  >
                                    <div>
                                      <p className="font-medium">
                                        {tx.merchant}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {tx.date}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {tx.type === 'credit' ? (
                                        <TrendingUp className="h-4 w-4 text-success" />
                                      ) : (
                                        <TrendingDown className="h-4 w-4 text-destructive" />
                                      )}
                                      <span
                                        className={`font-bold flex items-center ${tx.type === 'credit'
                                          ? 'text-success'
                                          : ''
                                          }`}
                                      >
                                        {tx.type === 'credit' ? '+' : ''}
                                        <CurrencyIcon currency={settings?.currency} className="h-3 w-3 mx-0.5" />
                                        {tx.amount.toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          </AccordionContent>
                        </>
                      )}
                    </AccordionItem>
                  </Accordion>
                </Card>
              );
            })}

            {/* Uncategorized Section */}
            {(() => {
              const formalCategoryNames = (categories || []).map(c => c.name);
              const uncategorizedTransactions = (transactions || []).filter(
                (t) => !formalCategoryNames.includes(t.category)
              );

              if (uncategorizedTransactions.length === 0) return null;

              return (
                <Card className="shadow-sm bg-muted/20 border-dashed transition-shadow duration-300">
                  <Accordion type="multiple" className="w-full">
                    <AccordionItem value="uncategorized" className="border-none">
                      <div className="flex items-center p-4">
                        <div className="p-3 rounded-xl bg-muted/30">
                          <MoreHorizontal className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="flex-1 ml-4">
                          <h3 className="font-semibold text-lg text-muted-foreground italic">
                            Uncategorized / Others
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {uncategorizedTransactions.length} transactions needing review
                          </p>
                        </div>
                      </div>

                      <AccordionTrigger className="text-sm py-2 px-4 hover:no-underline justify-start gap-1">
                        View Transactions
                      </AccordionTrigger>
                      <AccordionContent className="px-2 pb-2">
                        <Card className="bg-muted/50 shadow-inner">
                          <CardContent className="p-2 space-y-2">
                            {uncategorizedTransactions.map((tx) => (
                              <div
                                key={tx.id}
                                className="flex items-center justify-between text-sm p-2 rounded-md bg-background"
                              >
                                <div>
                                  <p className="font-medium">{tx.merchant}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {tx.date} • <span className="text-destructive font-mono text-[10px]">{tx.category}</span>
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  {tx.type === 'credit' ? (
                                    <TrendingUp className="h-4 w-4 text-success" />
                                  ) : (
                                    <TrendingDown className="h-4 w-4 text-destructive" />
                                  )}
                                  <span
                                    className={`font-bold flex items-center ${tx.type === 'credit' ? 'text-success' : ''}`}
                                  >
                                    {tx.type === 'credit' ? '+' : ''}
                                    <CurrencyIcon currency={settings?.currency} className="h-3 w-3 mx-0.5" />
                                    {tx.amount.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </Card>
              );
            })()}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg">
            <FolderTree className="mx-auto h-10 w-10 mb-2" />
            <h3 className="font-semibold">No categories found.</h3>
            <p className="text-sm">Add a new category to get started!</p>
          </div>
        )}
      </div>
    </>
  );
};

export default Categories;
