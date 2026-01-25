import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateWithDay(date: Date | string, dayOfWeek?: string | null): string {
  const dateObj = new Date(date);
  const formatted = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(dateObj);
  
  // If dayOfWeek is provided, use it; otherwise derive from date
  const day = dayOfWeek || new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(dateObj);
  
  return `${day}, ${formatted}`;
}

export function getDayOfWeek(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function maskCardNumber(cardNumber: string): string {
  if (cardNumber.length < 4) return cardNumber;
  return `**** **** **** ${cardNumber.slice(-4)}`;
}

export function getLastFour(cardNumber: string): string {
  return cardNumber.slice(-4);
}
