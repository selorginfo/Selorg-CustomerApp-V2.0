import { Platform, ViewStyle } from 'react-native';

function elevate(elevation: number, color = '#1A2E1A'): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation },
    default: {
      shadowColor: color,
      shadowOpacity: 0.16,
      shadowRadius: elevation * 1.6,
      shadowOffset: { width: 0, height: elevation / 1.6 },
    },
  }) as ViewStyle;
}

export const shadows = {
  card: elevate(4),
  raised: elevate(8),
  floating: elevate(14),
};

export default shadows;
