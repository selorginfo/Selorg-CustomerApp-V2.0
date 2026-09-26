import type { ImageSourcePropType } from 'react-native';

/**
 * UI-facing product shape rendered by ProductCard and the product grids.
 * Screens map their API payload into this; every field must come from the
 * API — nothing here is invented for display.
 */
export interface Product {
  id: string;
  categoryId: string;
  sub: string;
  name: string;
  /** Pack size as the API reports it. Empty when it doesn't report one. */
  unit: string;
  price: number;
  /** Equal to `price` when there's no genuine strike-through price. */
  mrp: number;
  /** `null` when the API doesn't report stock: orderable, count unknown. */
  stockQuantity: number | null;
  /** Units allowed in the cart at once. Missing means no cap. */
  maxOrderLimit?: number | null;
  image: ImageSourcePropType;
  /** `0` hides the rating pill rather than showing a made-up score. */
  rating: number;
  bytes: string[];
}
