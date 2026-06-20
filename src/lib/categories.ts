import { Category } from "@prisma/client";

const categoryKeywords: Record<Category, string[]> = {
  GROCERIES: ["milk", "egg", "bread", "coffee", "rice", "paneer", "banana", "grocery", "vegetable"],
  ELECTRONICS: ["charger", "usb", "cable", "laptop", "phone", "adapter", "earbuds", "sleeve"],
  FASHION: ["shoe", "shirt", "jeans", "dress", "jacket", "sneaker"],
  HOUSEHOLD: ["cleaning", "cloth", "dishwash", "detergent", "mop", "home"],
  FOOD: ["pizza", "burger", "meal", "restaurant", "snack"],
  SUBSCRIPTIONS: ["prime", "subscription", "membership", "renewal"],
  OTHER: []
};

export function inferCategory(text: string): Category {
  const normalized = text.toLowerCase();

  for (const [category, keywords] of Object.entries(categoryKeywords) as [Category, string[]][]) {
    if (category !== Category.OTHER && keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }

  return Category.OTHER;
}

export function categoryLabel(category: Category) {
  return category
    .toLowerCase()
    .replace("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
