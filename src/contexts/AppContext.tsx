
'use client';

import { ReactNode, createContext, useContext } from "react";
import { useSupabase } from "@/lib/supabase/provider";
import { addDocument, deleteDocument, updateDocument, setDocument } from "@/hooks/use-supabase";
import { autoCategorizeExpense } from "@/ai/categorize";
import type { Transaction, Settings, Category } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error";
import { formatDate } from "@/lib/utils";

export interface AppContextType {
  addTransaction: (
    transaction: Omit<Transaction, "id" | "date" | "created_at" | "user_id">,
    autoCategorize: boolean
  ) => Promise<void>;
  deleteTransaction: (id: number) => void;
  addCategory: (category: Omit<Category, "id" | "user_id" | "created_at">) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useSupabase();
  const user = session?.user;
  const supabase = createClient();
  const { mutate } = useSWRConfig();

  const addTransaction = async (
    transaction: Omit<Transaction, "id" | "date" | "created_at" | "user_id">,
    autoCategorize: boolean
  ) => {
    if (!user) return;

    let finalCategoryName = transaction.category;

    if (autoCategorize) {
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id);

      if (catError) { console.error(catError); }

      const predicted = await autoCategorizeExpense(
        transaction.merchant,
        categories || []
      );

      finalCategoryName = predicted || "Others";

      // Check if category exists (case-insensitive)
      const existingCat = (categories || []).find(
        (c) => c.name.toLowerCase() === finalCategoryName.toLowerCase()
      );

      if (!existingCat) {
        await addDocument("categories", {
          name: finalCategoryName.charAt(0).toUpperCase() + finalCategoryName.slice(1), // Title Case
          icon: "FolderTree",
          color: "text-primary",
          bg_color: "bg-primary/10",
          groups: [],
        });
        mutate(`categories?select=*&user_id=eq.${user.id}`); // Force refresh immediately
      } else {
        finalCategoryName = existingCat.name; // Use existing casing
      }
    }

    await addDocument("transactions", {
      ...transaction,
      category: finalCategoryName,
      date: formatDate(new Date()),
    });
    mutate(`transactions?select=*&user_id=eq.${user.id}`);
    mutate(`categories?select=*&user_id=eq.${user.id}`);
  };

  const deleteTransaction = async (id: number) => {
    if (!user) return;
    await deleteDocument("transactions", id);
    mutate(`transactions?select=*&user_id=eq.${user.id}`);
  };

  const addCategory = async (category: Omit<Category, "id" | "user_id" | "created_at">) => {
    if (!user) return;
    await addDocument("categories", category);
    mutate(`categories?select=*&user_id=eq.${user.id}`);
  };

  const deleteCategory = async (id: number) => {
    if (!user) return;
    const { error } = await supabase.rpc('delete_category_by_id', { category_id_to_delete: id });

    if (error) {
      console.error('Failed to delete category:', error);
      if (error.code === 'PGRST202') {
        toast.error("Database Update Required", {
          description: "Please run the 'fix_categories.sql' script in Supabase SQL Editor to enable deletion.",
          duration: 10000
        });
      } else {
        toast.error(`Failed to delete category: ${error.message}`);
      }
      return;
    }
    toast.success('Category deleted and transactions reassigned.');
    mutate(`transactions?select=*&user_id=eq.${user.id}`);
    mutate(`categories?select=*&user_id=eq.${user.id}`);
  };

  const updateSettings = async (settings: Partial<Settings>) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ ...settings, user_id: user.id }, { onConflict: 'user_id' });

      if (error) throw error;

      mutate(`settings?select=*&user_id=eq.${user.id}`);
      toast.success("Settings updated successfully!");

    } catch (error) {
      toast.error("Failed to update settings.", {
        description: getErrorMessage(error),
      });
      console.error("Settings update error:", error);
    }
  };

  return (
    <AppContext.Provider
      value={{
        addTransaction,
        deleteTransaction,
        addCategory,
        deleteCategory,
        updateSettings,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
