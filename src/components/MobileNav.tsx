
'use client';

import {
  Home,
  FolderTree,
  Upload,
  BarChart3,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const MobileNav = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const pathname = usePathname();



  const navItems = [
    { icon: Home, label: "Home", path: "/dashboard" },
    { icon: Users, label: "Groups", path: "/dashboard/groups" },
    { icon: FolderTree, label: "Categories", path: "/dashboard/categories" },
    { icon: Upload, label: "Import", path: "/dashboard/import" },
    { icon: BarChart3, label: "Analytics", path: "/dashboard/analytics" },
    { icon: Settings, label: "Settings", path: "/dashboard/settings" },
  ];

  const controlNavbar = useCallback(() => {
    if (typeof window === "undefined") return;

    if (window.scrollY < lastScrollY || window.scrollY <= 10) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }

    setLastScrollY(window.scrollY);
  }, [lastScrollY]);

  useEffect(() => {
    window.addEventListener("scroll", controlNavbar);
    return () => {
      window.removeEventListener("scroll", controlNavbar);
    };
  }, [controlNavbar]);

  const navVariants = {
    hidden: { y: "100%", opacity: 0.8 },
    visible: { y: "0%", opacity: 1 },
  };

  if (!pathname.startsWith('/dashboard')) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.nav
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={navVariants}
          transition={{ type: "spring", stiffness: 400, damping: 40 }}
          className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-sm border-t border-border/80 z-50 safe-area-bottom"
        >
          <div className="grid grid-cols-6 h-16 px-2">
            {navItems.map(({ icon: Icon, label, path }) => (
              <Link
                key={path}
                href={path}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground",
                  pathname === path && "text-primary bg-secondary"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium text-center">
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
};
