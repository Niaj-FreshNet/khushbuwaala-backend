// Operating-expense categories. Stock purchases are NOT expenses here: they are recorded through
// procurement (Finance → receive stock) so they become product cost, not overhead.
export const EXPENSE_CATEGORIES = [
  { value: 'RENT', label: 'Rent' },
  { value: 'SALARIES', label: 'Salaries & wages' },
  { value: 'UTILITIES', label: 'Utilities (electricity, internet, water)' },
  { value: 'MARKETING', label: 'Marketing & ads' },
  { value: 'PACKAGING', label: 'Packaging & supplies for orders' },
  { value: 'DELIVERY', label: 'Delivery & courier' },
  { value: 'TRANSPORT', label: 'Transport & travel' },
  { value: 'OFFICE', label: 'Office & shop supplies' },
  { value: 'EQUIPMENT', label: 'Equipment & furniture' },
  { value: 'MAINTENANCE', label: 'Repairs & maintenance' },
  { value: 'FEES', label: 'Bank & payment fees' },
  { value: 'TAXES', label: 'Taxes & licenses' },
  { value: 'STAFF_MEALS', label: 'Staff meals & refreshments' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const EXPENSE_CATEGORY_VALUES: string[] = EXPENSE_CATEGORIES.map((c) => c.value);
export const UNCATEGORIZED = 'UNCATEGORIZED';
