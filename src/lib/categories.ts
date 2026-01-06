import type { TransactionType } from './types';

export const DEFAULT_CATEGORIES: Record<TransactionType, string[]> = {
  expense: [
    'Food Delivery',
    'Dining Out',
    'Groceries & Home Supplies',
    'Coffee & Snacks',
    'Housing',
    'Utilities & Connectivity',
    'Transport',
    'Subscriptions',
    'Shopping',
    'Entertainment & Social',
    'Health',
    'Gifts & Donations',
    'Work / Reimbursable',
    'Travel',
  ],
  income: ['Salary', 'Bonus', 'Gift', 'Interest', 'Other'],
  transfer: ['Savings', 'Invest', 'Credit Card', 'Other'],
};
