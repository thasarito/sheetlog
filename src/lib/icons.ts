import type { LucideIcon } from "lucide-react";
import {
  Wallet,
  CreditCard,
  Banknote,
  PiggyBank,
  BadgeDollarSign,
  Coins,
  TrendingUp,
  Percent,
  Utensils,
  Coffee,
  Wine,
  Pizza,
  Apple,
  ShoppingCart,
  ShoppingBag,
  Gift,
  Package,
  Shirt,
  Watch,
  Car,
  Bus,
  Plane,
  Train,
  Bike,
  Fuel,
  House,
  Building,
  Bed,
  Sofa,
  Lamp,
  Key,
  HeartPulse,
  Pill,
  Dumbbell,
  Activity,
  Film,
  Music,
  Gamepad2,
  BookOpen,
  Headphones,
  Tv,
  Briefcase,
  Laptop,
  Phone,
  Mail,
  Tag,
  Folder,
  Star,
  Sparkles,
  Zap,
  Repeat,
  Wifi,
  Globe,
  Map as MapIcon,
  Camera,
  Scissors,
  Wrench,
  Ellipsis,
  ArrowLeftRight,
} from "lucide-react";
import type { TransactionType } from "./types";

// Curated list of ~50 popular icons for the picker
export const ICON_PICKER_LIST = [
  // Finance
  "Wallet",
  "CreditCard",
  "Banknote",
  "PiggyBank",
  "BadgeDollarSign",
  "Coins",
  "TrendingUp",
  "Percent",
  // Food & Drink
  "Utensils",
  "Coffee",
  "Wine",
  "Pizza",
  "Apple",
  // Shopping
  "ShoppingCart",
  "ShoppingBag",
  "Gift",
  "Package",
  "Shirt",
  "Watch",
  // Transport
  "Car",
  "Bus",
  "Plane",
  "Train",
  "Bike",
  "Fuel",
  // Home & Living
  "House",
  "Building",
  "Bed",
  "Sofa",
  "Lamp",
  "Key",
  // Health & Wellness
  "HeartPulse",
  "Pill",
  "Dumbbell",
  "Activity",
  // Entertainment
  "Film",
  "Music",
  "Gamepad2",
  "BookOpen",
  "Headphones",
  "Tv",
  // Work
  "Briefcase",
  "Laptop",
  "Phone",
  "Mail",
  // Categories
  "Tag",
  "Folder",
  "Star",
  "Sparkles",
  "Zap",
  "Repeat",
  "Wifi",
  "Globe",
  "Map",
  "Camera",
  "Scissors",
  "Wrench",
  "Ellipsis",
  "ArrowLeftRight",
] as const;

// Static icon map for tree-shaking (avoids importing all Lucide icons)
export const ICON_MAP: Record<IconName, LucideIcon> = {
  Wallet,
  CreditCard,
  Banknote,
  PiggyBank,
  BadgeDollarSign,
  Coins,
  TrendingUp,
  Percent,
  Utensils,
  Coffee,
  Wine,
  Pizza,
  Apple,
  ShoppingCart,
  ShoppingBag,
  Gift,
  Package,
  Shirt,
  Watch,
  Car,
  Bus,
  Plane,
  Train,
  Bike,
  Fuel,
  House,
  Building,
  Bed,
  Sofa,
  Lamp,
  Key,
  HeartPulse,
  Pill,
  Dumbbell,
  Activity,
  Film,
  Music,
  Gamepad2,
  BookOpen,
  Headphones,
  Tv,
  Briefcase,
  Laptop,
  Phone,
  Mail,
  Tag,
  Folder,
  Star,
  Sparkles,
  Zap,
  Repeat,
  Wifi,
  Globe,
  Map: MapIcon,
  Camera,
  Scissors,
  Wrench,
  Ellipsis,
  ArrowLeftRight,
};

export type IconName = (typeof ICON_PICKER_LIST)[number];

// Default icons
export const DEFAULT_ACCOUNT_ICON: IconName = "Wallet";
export const DEFAULT_CATEGORY_ICONS: Record<TransactionType, IconName> = {
  expense: "Tag",
  income: "BadgeDollarSign",
  transfer: "ArrowLeftRight",
};

// Suggested icon mapping for common category names
export const SUGGESTED_CATEGORY_ICONS: Record<string, IconName> = {
  "Food Delivery": "Utensils",
  "Dining Out": "Utensils",
  "Groceries & Home Supplies": "ShoppingCart",
  "Coffee & Snacks": "Coffee",
  Housing: "House",
  "Utilities & Connectivity": "Wifi",
  Transport: "Car",
  Subscriptions: "Repeat",
  Shopping: "ShoppingBag",
  "Entertainment & Social": "Film",
  Health: "HeartPulse",
  "Gifts & Donations": "Gift",
  "Work / Reimbursable": "Briefcase",
  Travel: "Plane",
  Salary: "BadgeDollarSign",
  Bonus: "Sparkles",
  Gift: "Gift",
  Interest: "Percent",
  Savings: "PiggyBank",
  Invest: "TrendingUp",
  "Credit Card": "CreditCard",
  Other: "Ellipsis",
};

// Preset color palette
export const COLOR_PALETTE = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Yellow", value: "#eab308" },
  { name: "Lime", value: "#84cc16" },
  { name: "Green", value: "#22c55e" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Gray", value: "#6b7280" },
] as const;

export type ColorValue = (typeof COLOR_PALETTE)[number]["value"];

// Default colors for category types
export const DEFAULT_CATEGORY_COLORS: Record<TransactionType, ColorValue> = {
  expense: "#f97316", // orange
  income: "#22c55e", // green
  transfer: "#3b82f6", // blue
};

export const DEFAULT_ACCOUNT_COLOR: ColorValue = "#6366f1"; // indigo

// Suggested color mapping for common category names
export const SUGGESTED_CATEGORY_COLORS: Record<string, ColorValue> = {
  "Food Delivery": "#f59e0b", // amber
  "Dining Out": "#f97316", // orange
  "Groceries & Home Supplies": "#10b981", // emerald
  "Coffee & Snacks": "#f59e0b", // amber
  Housing: "#0ea5e9", // sky
  "Utilities & Connectivity": "#3b82f6", // blue
  Transport: "#6366f1", // indigo
  Subscriptions: "#8b5cf6", // violet
  Shopping: "#ec4899", // pink
  "Entertainment & Social": "#a855f7", // purple
  Health: "#f43f5e", // rose
  "Gifts & Donations": "#ef4444", // red
  "Work / Reimbursable": "#06b6d4", // cyan
  Travel: "#14b8a6", // teal
  Salary: "#10b981", // emerald
  Bonus: "#eab308", // yellow
  Gift: "#f43f5e", // rose
  Interest: "#84cc16", // lime
  Savings: "#f59e0b", // amber
  Invest: "#10b981", // emerald
  "Credit Card": "#6366f1", // indigo
  Other: "#6b7280", // gray
};
