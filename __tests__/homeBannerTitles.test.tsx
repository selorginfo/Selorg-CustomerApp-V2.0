/**
 * Home scroll banners are image-only. Section labels and the title/subtitle
 * painted on the creative must stay off the card. Product and lifestyle
 * headings on the same screen stay.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Image, ScrollView, Text } from 'react-native';
import { Dimensions } from 'react-native';
import { HomeBannerRail, nextPagerStep } from '../src/components/HomeBannerRail';
import type { HomeBanner } from '../src/utils/homeResolve';

const banners: HomeBanner[] = [
  {
    _id: 'b1',
    bannerId: 'Ban-046',
    title: 'Scroll Banner',
    subtitle: 'Freshly Picked Fruits',
    imageUrl: 'https://cdn.example/fruits.png',
  },
  {
    _id: 'b2',
    bannerId: 'Ban-047',
    title: 'Farm Fresh Organic Produce',
    imageUrl: 'https://cdn.example/produce.png',
  },
];

function textValues(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map(node => String(node.props.children ?? ''));
}

describe('home banner titles', () => {
  it('renders banner images without the section title or the title on the image', async () => {
    const onPress = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <HomeBannerRail sectionKey="scroll_banner" items={banners} onPress={onPress} />,
      );
    });

    expect(renderer).toBeDefined();
    const tree = renderer!;
    expect(textValues(tree)).toEqual([]);
    expect(JSON.stringify(tree.toJSON())).not.toMatch(/Scroll Banner|Freshly Picked|Farm Fresh/);

    const images = tree.root.findAllByType(Image).map(node => node.props.source.uri);
    expect(images.slice(0, 2)).toEqual([
      'https://cdn.example/fruits.png',
      'https://cdn.example/produce.png',
    ]);
    expect(images.filter((uri: string) => uri === 'https://cdn.example/fruits.png').length).toBeGreaterThan(0);

    const card = tree.root.findByProps({ testID: 'home-banner-Ban-046' });
    await ReactTestRenderer.act(async () => {
      card.props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith(banners[0]);
    await ReactTestRenderer.act(async () => {
      tree.unmount();
    });
  });

  it('shows the fruit pair as a short horizontal slide', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <HomeBannerRail sectionKey="banner_scroll_mid_row" items={banners} onPress={jest.fn()} />,
      );
    });

    const scroller = renderer!.root.findByType(ScrollView);
    expect(scroller.props.horizontal).toBe(true);
    expect(scroller.props.snapToInterval).toBeGreaterThan(0);

    const card = renderer!.root.findByProps({ testID: 'home-banner-Ban-046' });
    const frame = (Array.isArray(card.props.style) ? card.props.style : [card.props.style]).find(
      (style: { width?: number; height?: number }) => style && typeof style.width === 'number',
    );
    expect(frame.height).toBeLessThan(frame.width);
    expect(frame.height).toBeLessThanOrEqual(180);
    expect(renderer!.root.findAllByType(ScrollView)).toHaveLength(1);
    await ReactTestRenderer.act(async () => {
      renderer!.unmount();
    });
  });

  it('keeps product and lifestyle titles on the home screen', () => {
    const home = fs.readFileSync(path.join(__dirname, '../src/screens/home/index.tsx'), 'utf8');
    expect(home).toContain('<Text style={styles.sectionTitle}>{section.label}</Text>');
    expect(home).toContain("{item.title || item.name || 'Explore'}");
    expect(home).toContain('Shop by category');
    expect(home).not.toContain('promoBannerTitle');
    expect(home).not.toContain('promoBannerText');
    expect(home).toContain('<HomeBannerRail');
    const bannerRow = home.slice(home.indexOf('const renderBannerRow'), home.indexOf('const renderSection'));
    expect(bannerRow).not.toContain('section.label');
    expect(bannerRow).not.toContain('b.title');
    expect(bannerRow).not.toContain('b.subtitle');
  });
});

const gridBanners: HomeBanner[] = [
  {
    _id: 'grid-1',
    title: 'Scroll Banner',
    subtitle: 'Freshly Picked Fruits',
    imageUrl: 'https://cdn.example/home-banners/1790667036299-8a0a237e.webp',
  },
  {
    _id: 'grid-2',
    title: 'Scroll Banner',
    subtitle: 'Farm Fresh Organic Produce',
    imageUrl: 'https://cdn.example/home-banners/1790667068708-bba38044.webp',
  },
];

describe('home grid banner carousel', () => {
  const aspect = 1362 / 1155;

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('pages the two API banners horizontally without cloning or stacking them', async () => {
    jest.spyOn(Image, 'getSize').mockImplementation((_uri, success) => {
      if (typeof success === 'function') success(1362, 1155);
    });
    const onPress = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    try {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <HomeBannerRail
            sectionKey="banner_scroll-banner_ban-047_row"
            layout="grid"
            items={gridBanners}
            onPress={onPress}
          />,
        );
      });

      const tree = renderer!;
      expect(textValues(tree)).toEqual([]);
      expect(JSON.stringify(tree.toJSON())).not.toMatch(/Freshly Picked|Farm Fresh|Scroll Banner/);

      const images = tree.root.findAllByType(Image).map(node => node.props.source.uri);
      expect(images).toEqual([gridBanners[0].imageUrl, gridBanners[1].imageUrl]);

      const scroller = tree.root.findByType(ScrollView);
      const pageWidth = Dimensions.get('window').width;
      expect(scroller.props.horizontal).toBe(true);
      expect(scroller.props.pagingEnabled).toBe(true);
      expect(scroller.props.snapToInterval).toBe(pageWidth);
      expect(scroller.props.style).toEqual(expect.objectContaining({ width: pageWidth, height: expect.any(Number) }));

      const card = tree.root.findByProps({ testID: 'home-banner-grid-1' });
      const frame = (Array.isArray(card.props.style) ? card.props.style : [card.props.style]).find(
        (style: { width?: number; height?: number }) => style && typeof style.height === 'number',
      );
      const cardW = pageWidth - 32;
      expect(frame.width).toBe(cardW);
      expect(frame.height).toBe(Math.round(cardW / aspect));
      expect(frame.height).toBeLessThan(frame.width);

      await ReactTestRenderer.act(async () => {
        card.props.onPress();
      });
      expect(onPress).toHaveBeenCalledWith(gridBanners[0]);
    } finally {
      await ReactTestRenderer.act(async () => {
        renderer?.unmount();
      });
    }
  });

  it('auto-slides to the next banner, then back the other way', async () => {
    jest.spyOn(Image, 'getSize').mockImplementation((_uri, success) => {
      if (typeof success === 'function') success(1362, 1155);
    });
    jest.useFakeTimers();
    const scrollTo = jest.fn();
    jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(scrollTo);
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    try {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <HomeBannerRail
            sectionKey="banner_scroll-banner_ban-047_row"
            layout="grid"
            items={gridBanners}
            onPress={jest.fn()}
          />,
        );
      });

      const pageWidth = Dimensions.get('window').width;
      scrollTo.mockClear();
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(4000);
      });
      expect(scrollTo).toHaveBeenCalledWith({ x: pageWidth, animated: true });

      scrollTo.mockClear();
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(4000);
      });
      expect(scrollTo).toHaveBeenCalledWith({ x: 0, animated: true });
    } finally {
      await ReactTestRenderer.act(async () => {
        renderer?.unmount();
      });
    }
  });

  it('keeps a manual swipe and then continues from that page', () => {
    expect(nextPagerStep(0, 1, 2)).toEqual({ index: 1, direction: 1 });
    expect(nextPagerStep(1, 1, 2)).toEqual({ index: 0, direction: -1 });
    expect(nextPagerStep(0, -1, 2)).toEqual({ index: 1, direction: 1 });
    expect(nextPagerStep(0, 1, 1)).toBeNull();
  });

  it('leaves a single promo and the lifestyle marquee on their existing paths', async () => {
    let single: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      single = ReactTestRenderer.create(
        <HomeBannerRail
          sectionKey="banner_moringa"
          items={[{ _id: 'm', bannerId: 'Ban-052', title: 'Moringa', imageUrl: 'https://cdn.example/moringa.webp' }]}
          onPress={jest.fn()}
        />,
      );
    });
    expect(single!.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(single!.root.findAllByType(Image).map(node => node.props.source?.uri)).toEqual([
      'https://cdn.example/moringa.webp',
    ]);

    let rail: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      rail = ReactTestRenderer.create(
        <HomeBannerRail
          sectionKey="banner_scroll-banner_ban-053_row"
          layout="scroll"
          items={[
            { _id: 'a', bannerId: 'Ban-053', imageUrl: 'https://cdn.example/a.webp' },
            { _id: 'b', bannerId: 'Ban-054', imageUrl: 'https://cdn.example/b.webp' },
          ]}
          onPress={jest.fn()}
        />,
      );
    });
    const urls = rail!.root.findAllByType(Image).map(node => node.props.source.uri);
    expect(urls.filter(uri => uri === 'https://cdn.example/a.webp').length).toBeGreaterThan(1);
    expect(rail!.root.findAllByProps({ testID: 'home-banner-carousel-banner_scroll-banner_ban-053_row' })).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      single!.unmount();
      rail!.unmount();
    });
  });
});
