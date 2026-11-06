import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Image } from 'react-native';
import { CategoryMediaHeader } from '../src/components/CategoryMediaHeader';
import { CmsVideoCard } from '../src/components/CmsVideoCard';
import { VideoPlayerProvider } from '../src/components/VideoPlayerHost';

jest.mock('react-native-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Video = React.forwardRef((props: object, ref: unknown) =>
    React.createElement(View, { ...props, ref, testID: 'native-video' }),
  );
  return { __esModule: true, default: Video, ViewType: { TEXTURE: 'texture' } };
});

async function render(node: React.ReactElement) {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(node);
  });
  return renderer!;
}

describe('cms video card', () => {
  it('shows a YouTube thumbnail and keeps the uploaded video separate', async () => {
    const tree = await render(
      <CmsVideoCard
        title="Honey"
        videoUrl="https://cdn.example/honey.mp4"
        youtubeUrl="https://youtu.be/dQw4w9WgXcQ"
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Know More From Experts');
    expect(json).toContain('Honey');
    expect(json).toContain('https://cdn.example/honey.mp4');
    const thumbs = tree.root.findAllByType(Image).map(node => node.props.source.uri);
    expect(thumbs).toContain('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(json).not.toContain('https://youtu.be/dQw4w9WgXcQ');
  });

  it('minimizes a YouTube video and an uploaded video', async () => {
    const tree = await render(
      <VideoPlayerProvider>
        <CmsVideoCard title="Honey" videoUrl="https://cdn.example/honey.mp4" youtubeUrl="https://youtu.be/dQw4w9WgXcQ" />
      </VideoPlayerProvider>,
    );

    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'cms-video-youtube' }).props.onPress();
    });
    expect(tree.root.findByProps({ testID: 'video-minimize' })).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'video-minimize' }).props.onPress();
    });
    expect(tree.root.findAllByProps({ testID: 'video-minimize' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'video-player-dock' })).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'video-close' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'cms-video-own' }).props.onPress();
    });
    expect(tree.root.findByProps({ testID: 'video-minimize' })).toBeTruthy();
  });
});

describe('category media header', () => {
  it('shows the subcategory image and both videos', async () => {
    const tree = await render(
      <CategoryMediaHeader
        categorySlug="fruits"
        categoryName="Fruits"
        categoryImage="https://cdn.example/fruits.jpg"
        subcategory={{
          _id: 's1',
          name: 'Premium Fruits',
          slug: 'premium-fruits',
          bannerImage: 'https://cdn.example/premium.jpg',
          bannerVideo: 'https://cdn.example/premium.mp4',
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        }}
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('https://cdn.example/premium.jpg');
    expect(json).not.toContain('100% CERTIFIED ORGANIC');
    expect(json).toContain('Know More From Experts');
    expect(json).toContain('https://cdn.example/premium.mp4');
  });

  it('drops the image on a hidden subcategory and still offers the video', async () => {
    const tree = await render(
      <CategoryMediaHeader
        categorySlug="millet-mandi"
        categoryName="Millet Mandi"
        subcategory={{
          _id: 's2',
          name: 'Millet Noodles',
          slug: 'millet-noodles-pasta',
          bannerImage: 'https://cdn.example/noodles.jpg',
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        }}
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('https://cdn.example/noodles.jpg');
    expect(json).toContain('Know More From Experts');
  });

  it('keeps the category title overlay', async () => {
    const tree = await render(
      <CategoryMediaHeader
        categorySlug="fruits"
        categoryName="Fruits"
        categoryImage="https://cdn.example/fruits.jpg"
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Fruits');
    expect(json).toContain('100% CERTIFIED ORGANIC');
    expect(json).toContain('https://cdn.example/fruits.jpg');
  });
});
