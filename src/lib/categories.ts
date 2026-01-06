import type { CategoryConfigWithMeta } from "./types";
import {
  SUGGESTED_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  DEFAULT_CATEGORY_COLORS,
} from "./icons";

function makeCategory(name: string, type: "expense" | "income" | "transfer") {
  return {
    name,
    icon: SUGGESTED_CATEGORY_ICONS[name] ?? DEFAULT_CATEGORY_ICONS[type],
    color: SUGGESTED_CATEGORY_COLORS[name] ?? DEFAULT_CATEGORY_COLORS[type],
  };
}

export const DEFAULT_CATEGORIES: CategoryConfigWithMeta = {
  expense: [
    "Food Delivery",
    "Dining Out",
    "Groceries & Home Supplies",
    "Coffee & Snacks",
    "Housing",
    "Utilities & Connectivity",
    "Transport",
    "Subscriptions",
    "Shopping",
    "Entertainment & Social",
    "Health",
    "Gifts & Donations",
    "Work / Reimbursable",
    "Travel",
  ].map((name) => makeCategory(name, "expense")),
  income: ["Salary", "Bonus", "Gift", "Interest", "Other"].map((name) =>
    makeCategory(name, "income")
  ),
  transfer: ["Savings", "Invest", "Credit Card", "Other"].map((name) =>
    makeCategory(name, "transfer")
  ),
};
