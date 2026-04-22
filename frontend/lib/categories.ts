export type CategoryTree = Record<string, string[]>;

export const CATEGORY_TREE: CategoryTree = {
  "Buy & Sell": ["Antiques & Collectibles", "Housewares", "Electronics", "Furniture", "Home & Garden", "Clothing", "Sporting Goods"],
  "Cars & Vehicles": ["Cars & Trucks", "Motorcycles", "Auto Parts", "Other"],
  "Real Estate": ["For Rent", "For Sale", "Room Rental", "Commercial"],
  "Jobs": ["General Labour", "Customer Service", "Skilled Trades", "Office", "Other"],
  "Services": ["Home Services", "Lessons & Tutoring", "Skilled Trades", "Other"],
  "Community": ["Events", "Volunteers", "Lost & Found", "Other"],
};

export function subcategoriesFor(category: string | undefined): string[] {
  if (!category) return [];
  return CATEGORY_TREE[category] ?? [];
}
