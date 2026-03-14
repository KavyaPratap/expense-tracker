
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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/contexts/AppContext';
import { useCollection, useDoc } from '@/hooks/use-supabase';
import { convertAmount, getCurrencySymbol } from '@/lib/currency';
import { useSupabase } from '@/lib/supabase/provider';
import type {
  BudgetSettings,
  Settings as AppSettings,
  Transaction,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Bell,
  ChevronRight,
  Download,
  FileText,
  Moon,
  Sparkles,
  Target,
  User,
  DollarSign,
  Euro,
  PoundSterling,
  FingerprintPattern,
  Smartphone,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

const RupeeIcon = ({ className, strokeWidth = 2.5 }: { className?: string; strokeWidth?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M6 3h12" />
    <path d="M6 8h12" />
    <path d="m6 13 8.5 8" />
    <path d="M6 13h3" />
    <path d="M9 13c6.667 0 6.667-10 0-10" />
  </svg>
);

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong';
};

const CurrencySelector = ({
  value,
  onChange,
  pendingValue,
}: {
  value: AppSettings['currency'];
  onChange: (value: AppSettings['currency']) => void;
  pendingValue?: AppSettings['currency'];
}) => {
  const options = [
    { value: 'USD', symbol: '$', icon: DollarSign },
    { value: 'EUR', symbol: '€', icon: Euro },
    { value: 'GBP', symbol: '£', icon: PoundSterling },
    { value: 'INR', symbol: '\u20B9', icon: RupeeIcon },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-2 p-2 bg-muted rounded-lg">
      {options.map((option) => {
        const isSelected = value === option.value;
        const isPending = pendingValue === option.value;
        const isFading = pendingValue && isSelected;
        const Icon = option.icon;

        return (
          <Button
            key={option.value}
            variant="ghost"
            onClick={() => onChange(option.value as AppSettings['currency'])}
            className={cn(
              'h-auto flex-col p-3 transition-all duration-300 relative overflow-visible',
              isSelected && !pendingValue && 'bg-primary/10 text-primary border border-primary',
              isPending && 'bg-primary text-primary-foreground scale-105 shadow-xl ring-2 ring-primary ring-offset-2 z-10',
              isFading && 'bg-primary/5 text-primary/50 opacity-40 scale-95 blur-[0.5px]',
              !isSelected && !isPending && 'bg-background hover:bg-accent'
            )}
          >
            <Icon className="h-6 w-6 mb-1" strokeWidth={2.5} />
            <span className="text-xs">{option.value}</span>
            {isPending && (
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-white border-2 border-primary animate-pulse shadow-sm z-20" />
            )}
          </Button>
        );
      })}
    </div>
  );
};

const Settings = () => {
  const { updateSettings } = useApp();
  const { session, supabase } = useSupabase();
  const user = session?.user;
  const { setTheme } = useTheme();

  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);

  useEffect(() => {
    const enabled = localStorage.getItem('biometric_enabled') === 'true';
    setIsBiometricEnabled(enabled);
  }, []);

  const handleBiometricToggle = (enabled: boolean) => {
    setIsBiometricEnabled(enabled);
    localStorage.setItem('biometric_enabled', String(enabled));
    if (enabled) {
      toast.success('Biometric login enabled');
    } else {
      toast.info('Biometric login disabled');
    }
  };

  const handleInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstallPrompt(null);
      }
    } else {
      // iOS / other fallback
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIOS) {
        toast.info('Install on iOS: Tap Share -> Add to Home Screen');
      } else {
        toast.info('Already installed or not supported in this browser');
      }
    }
  };

  // ... (existing states)

  const [isConverting, setIsConverting] = useState(false);
  const [conversionDialog, setConversionDialog] = useState<{
    open: boolean;
    from?: AppSettings['currency'];
    to?: AppSettings['currency'];
  }>({ open: false });

  // ... (existing hooks)

  const { data: settings } = useDoc<AppSettings>(
    user ? `settings?select=*&user_id=eq.${user.id}` : null,
  );

  const { data: transactions } = useCollection<Transaction>(
    user ? `transactions?select=*&user_id=eq.${user.id}` : null,
  );

  // ... (existing methods: handleCurrencyChange, confirmCurrencyChange, handleExportCSV, handleExportPDF, handleThemeChange)

  const handleCurrencyChange = async (newCurrency: AppSettings['currency']) => {
    const oldCurrency = settings?.currency || 'USD';
    if (oldCurrency === newCurrency) return;
    setConversionDialog({ open: true, from: oldCurrency, to: newCurrency });
  };

  const confirmCurrencyChange = async () => {
    if (!conversionDialog.from || !conversionDialog.to || !user || !supabase) return;
    setIsConverting(true);
    try {
      const rate = convertAmount(1, conversionDialog.from!, conversionDialog.to!);
      const { error: rpcError } = await supabase.rpc('convert_currency', {
        p_user_id: user.id,
        p_rate: rate,
        p_new_currency: conversionDialog.to
      });
      if (rpcError) throw rpcError;
      const { data: budgetData, error: bError } = await supabase
        .from('budgets')
        .select('budgets')
        .eq('user_id', user.id)
        .maybeSingle();
      if (bError && bError.code !== 'PGRST116') throw bError;
      if (budgetData?.budgets) {
        const convertedBudgets: { [key: string]: number } = {};
        for (const categoryId in budgetData.budgets) {
          const amount = budgetData.budgets[categoryId];
          convertedBudgets[categoryId] = convertAmount(amount, conversionDialog.from!, conversionDialog.to!);
        }
        const { error: budgetUpdateError } = await supabase
          .from('budgets')
          .update({ budgets: convertedBudgets })
          .eq('user_id', user.id);
        if (budgetUpdateError) throw budgetUpdateError;
      }
      toast.success(`Currency successfully changed to ${conversionDialog.to}`);
      updateSettings({ currency: conversionDialog.to });
    } catch (error: unknown) {
      toast.dismiss();
      toast.error('Conversion failed', { description: getErrorMessage(error) });
    } finally {
      setIsConverting(false);
      setConversionDialog({ open: false });
    }
  };

  const handleExportCSV = async () => {
    if (!transactions || transactions.length === 0) {
      toast.error('No transactions to export.');
      return;
    }
    const csv = [
      ['Date', 'Merchant', 'Amount', 'Type', 'Category', 'Status', 'Note'].join(','),
      ...transactions.map((t) => [t.date, `"${t.merchant.replace(/"/g, '""')}"`, t.amount, t.type, t.category, t.status, `"${(t.note || '').replace(/"/g, '""')}"`].join(','))
    ].join('\n');

    if (Capacitor.isNativePlatform()) {
      try {
        const fileName = `smartspend-expenses-${new Date().toISOString().split('T')[0]}.csv`;
        const result = await Filesystem.writeFile({
          path: fileName,
          data: csv,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });

        await Share.share({
          title: 'Export Expenses',
          text: 'Here is your expense report CSV.',
          url: result.uri,
          dialogTitle: 'Share Expenses CSV',
        });
        toast.success('Shared CSV successfully');
      } catch (e: any) {
        console.error('Export failed', e);
        toast.error('Export failed: ' + e.message);
      }
    } else {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartspend-expenses-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported successfully');
    }
  };

  const handleExportPDF = async () => {
    if (!transactions || transactions.length === 0) {
      toast.error('No transactions to export.');
      return;
    }
    const doc = new jsPDF();
    autoTable(doc, {
      head: [['Date', 'Merchant', 'Category', 'Type', 'Amount']],
      body: transactions.map(t => [t.date, t.merchant, t.category, t.type, `${getCurrencySymbol(settings?.currency)} ${t.amount.toFixed(2)}`]),
      startY: 30,
      didDrawPage: (data) => {
        doc.setFontSize(20);
        doc.text('Transaction Report', data.settings.margin.left, 20);
      }
    });

    if (Capacitor.isNativePlatform()) {
      try {
        const fileName = `smartspend-expenses-${new Date().toISOString().split('T')[0]}.pdf`;
        const pdfBase64 = doc.output('datauristring').split(',')[1];

        const result = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache,
        });

        await Share.share({
          title: 'Export Expenses PDF',
          text: 'Here is your expense report PDF.',
          url: result.uri,
          dialogTitle: 'Share Expenses PDF',
        });
        toast.success('Shared PDF successfully');
      } catch (e: any) {
        console.error('Export PDF failed', e);
        toast.error('Export failed: ' + e.message);
      }
    } else {
      doc.save(`smartspend-expenses-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF exported successfully');
    }
  };

  const handleThemeChange = (isDark: boolean) => {
    const newTheme = isDark ? 'dark' : 'light';
    setTheme(newTheme);
    updateSettings({ dark_mode: isDark });
  };


  const currentSettings: AppSettings = settings || {
    user_id: user?.id || '',
    notifications: true,
    dark_mode: false,
    auto_categ: true,
    language: 'English',
    currency: 'USD',
  };

  type SettingsItem =
    | {
      icon: any;
      label: string;
      toggle: true;
      value: boolean;
      onChange: (v: boolean) => void;
      isCurrency?: never;
      isLink?: never;
      onClick?: never;
    }
    | {
      icon: any;
      label: string;
      isCurrency: true;
      value: AppSettings['currency'];
      onChange: (v: AppSettings['currency']) => void;
      toggle?: never;
      isLink?: never;
      onClick?: never;
    }
    | {
      icon: any;
      label: string;
      isLink: true;
      to: string;
      toggle?: never;
      isCurrency?: never;
      onChange?: never;
      onClick?: never;
    }
    | {
      icon: any;
      label: string;
      onClick: () => void;
      toggle?: never;
      isCurrency?: never;
      isLink?: never;
      onChange?: never;
    };

  const sections: { title: string; items: SettingsItem[] }[] = [
    {
      title: 'App Preferences',
      items: [
        {
          icon: Bell,
          label: 'Notifications',
          toggle: true,
          value: currentSettings.notifications,
          onChange: (v: boolean) => updateSettings({ notifications: v }),
        },
        {
          icon: FingerprintPattern,
          label: 'Biometric Login',
          toggle: true,
          value: isBiometricEnabled,
          onChange: handleBiometricToggle,
        },
        {
          icon: Moon,
          label: 'Dark Mode',
          toggle: true,
          value: currentSettings.dark_mode,
          onChange: handleThemeChange,
        },
        {
          icon: Sparkles,
          label: 'Auto Categorization',
          toggle: true,
          value: currentSettings.auto_categ,
          onChange: (v: boolean) => updateSettings({ auto_categ: v }),
        },
        {
          icon: currentSettings.currency === 'INR' ? RupeeIcon
            : currentSettings.currency === 'EUR' ? Euro
            : currentSettings.currency === 'GBP' ? PoundSterling
            : DollarSign,
          label: 'Currency',
          isCurrency: true,
          value: currentSettings.currency,
          onChange: handleCurrencyChange,
        },
        {
          icon: Download,
          label: 'Install App',
          onClick: handleInstallClick,
        },
      ],
    },
    {
      title: 'Data & Budgets',
      items: [
        {
          icon: Target,
          label: 'Manage Budgets',
          isLink: true,
          to: '/dashboard/budgets',
        },
        { icon: FileText, label: 'Export PDF', onClick: handleExportPDF },
        { icon: Download, label: 'Export CSV', onClick: handleExportCSV },
      ],
    },
  ];

  return (
    <>
      <AlertDialog
        open={conversionDialog.open}
        onOpenChange={(open) =>
          setConversionDialog({ ...conversionDialog, open })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Currency Change</AlertDialogTitle>
            <AlertDialogDescription>
              Changing currency from{' '}
              <strong>{conversionDialog.from}</strong> to{' '}
              <strong>{conversionDialog.to}</strong> will permanently convert all
              your existing transaction and budget amounts. This action cannot be
              undone. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCurrencyChange}
              disabled={isConverting}
            >
              {isConverting ? 'Converting...' : 'Yes, Convert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageHeader title="Settings" subtitle="Customize your experience" />

      <div className="space-y-6">
        <div>
          <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Account
          </h2>
          <Link href="/dashboard/account">
            <Card className="hover:bg-muted/50 transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
                <User className="h-5 w-5" />
                <span className="flex-1 font-medium">Account Management</span>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </CardContent>
            </Card>
          </Link>
        </div>

        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              {section.title}
            </h2>

            <Card>
              <CardContent className="p-0 divide-y">
                {section.items.map((item, i) => {
                  const Icon = item.icon;

                  if (item.isCurrency) {
                    return (
                      <div key={item.label} className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <Icon className="h-5 w-5" />
                          <span>{item.label}</span>
                        </div>
                        <CurrencySelector
                          value={item.value as AppSettings['currency']}
                          onChange={item.onChange!}
                          pendingValue={conversionDialog.open ? conversionDialog.to : undefined}
                        />
                      </div>
                    );
                  }

                  const content = (
                    <div className="p-4 flex items-center gap-3">
                      <Icon className="h-5 w-5" />
                      <span className="flex-1">{item.label}</span>
                      {item.toggle ? (
                        <Switch
                          checked={item.value as boolean}
                          onCheckedChange={item.onChange!}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <ChevronRight className="h-4 w-4 opacity-50" />
                      )}
                    </div>
                  );

                  if (item.isLink) {
                    return (
                      <Link
                        href={item.to!}
                        key={item.label}
                        className="block hover:bg-muted/50 transition-colors rounded-lg"
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <div
                      key={item.label}
                      className={cn(
                        'cursor-pointer hover:bg-muted/50 transition-colors',
                        item.toggle && 'cursor-default',
                      )}
                      onClick={item.onClick as () => void}
                    >
                      {content}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>


      <p className="text-center text-xs text-muted-foreground mt-8">
        SmartSpend v1.0.0
      </p>
    </>
  );
};

export default Settings;
