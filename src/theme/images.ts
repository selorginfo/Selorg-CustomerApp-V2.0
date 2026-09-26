/** Central registry of bundled raster assets used across the redesigned app. */
export const images = {
  appLogo: require('../../assets/images/app-logo.png'),
  banner: require('../../assets/images/banner.png'),
  dealBanner: require('../../assets/images/deal-banner.png'),
  emptyCart: require('../../assets/images/empty-cart.png'),
  wishlistEmpty: require('../../assets/images/wishlist-empty.png'),
  lifestyleHeader: require('../../assets/images/lifestyle-header.png'),
  onboard1: require('../../assets/images/onboard-1.png'),
  onboard2: require('../../assets/images/onboard-2.png'),
  onboard3: require('../../assets/images/onboard-3.png'),
  organicTagline: require('../../assets/images/organic-tagline.png'),
  rider: require('../../assets/images/rider.png'),
  tinyTummies: require('../../assets/images/tiny-tummies.png'),
  wellbeing: require('../../assets/images/wellbeing.png'),
} as const;

export const categoryImages = {
  c1: require('../../assets/images/cat/fresh-fruits.png'),
  c2: require('../../assets/images/cat/fresh-vegetables.png'),
  c3: require('../../assets/images/cat/dairy-bread-eggs.png'),
  c4: require('../../assets/images/cat/atta-rice-dal.png'),
  c5: require('../../assets/images/cat/masalas-spices.png'),
  c6: require('../../assets/images/cat/oil-ghee.png'),
  c7: require('../../assets/images/cat/tea-coffee.png'),
  c8: require('../../assets/images/cat/dry-fruits-seeds.png'),
  c9: require('../../assets/images/cat/salt-sugar-jaggery.png'),
  c10: require('../../assets/images/cat/sauces-spreads.png'),
  c11: require('../../assets/images/cat/vermicelli-noodles.png'),
} as const;

export default images;
