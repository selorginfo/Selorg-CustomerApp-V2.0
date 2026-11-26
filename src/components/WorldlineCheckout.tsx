import React from 'react';
import { isWorldlineSdkAvailable } from '../utils/worldlineSdk';
import WorldlineCheckoutWebView, { type WorldlineCheckoutProps } from './WorldlineCheckoutWebView';
import WorldlineNativeCheckout from './WorldlineNativeCheckout';

export type { GatewayCloseInfo, GatewayProgressInfo, WorldlineCheckoutProps } from './WorldlineCheckoutWebView';

/** Android uses Paynimo's SDK; iOS and legacy redirect URLs keep the hosted WebView. */
export default function WorldlineCheckout(props: WorldlineCheckoutProps) {
  if (props.sessionPayload && isWorldlineSdkAvailable()) return <WorldlineNativeCheckout {...props} />;
  return <WorldlineCheckoutWebView {...props} />;
}
