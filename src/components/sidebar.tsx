"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  CreditCard,
  BarChart3,
  ShoppingCart,
  Upload,
  Home,
  Calendar,
  Settings,
  AlertTriangle,
  Package,
  Receipt,
  Zap,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Accounts", href: "/accounts", icon: Users },
  { name: "Cards", href: "/cards", icon: CreditCard },
  { name: "Events", href: "/events", icon: Calendar },
  { name: "Queue Analytics", href: "/queues", icon: BarChart3 },
  { name: "Purchases", href: "/purchases", icon: ShoppingCart },
  { name: "Listings", href: "/listings", icon: Package },
  { name: "Sales", href: "/sales", icon: Receipt },
  { name: "Error Analysis", href: "/analytics", icon: AlertTriangle },
  { name: "Import Data", href: "/import", icon: Upload },
  { name: "Generator", href: "/generator", icon: Zap },
  { name: "Checkout", href: "/checkout", icon: ShoppingBag },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-card border-r">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold">TM Accounts</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground">
          TM Accounts v0.1.0
        </p>
      </div>
    </div>
  );
}
