import React from 'react';
import { ActivityIndicator } from 'react-native';
import { colors } from '../theme';

interface Props {
  size?: number;
  color?: string;
}

export default function Spinner({ size = 28, color = colors.primary }: Props) {
  return <ActivityIndicator size={size > 24 ? 'large' : 'small'} color={color} />;
}
