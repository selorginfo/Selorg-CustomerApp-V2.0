import { shouldRewriteAsset } from '../src/config/assetUrl';

describe('shouldRewriteAsset', () => {
  it('leaves an icon name alone and rewrites a real image path', () => {
    expect(shouldRewriteAsset('icon', 'truck')).toBe(false);
    expect(shouldRewriteAsset('iconName', '/truck')).toBe(false);
    expect(shouldRewriteAsset('imageUrl', '/uploads/mango.jpg')).toBe(true);
    expect(shouldRewriteAsset('imageUrl', 'https://cdn.example/mango.jpg')).toBe(true);
    expect(shouldRewriteAsset('bannerImageUrl', 'uploads/hero.png')).toBe(true);
  });
});
