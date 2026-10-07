import { useEffect, useState } from 'react';
import { useAddress } from '../context/AddressContext';
import { DEFAULT_ETA_TEXT, deliveryApi, etaTextFromEstimate } from '../services/delivery.service';

/**
 * Live delivery promise (e.g. "12-17 mins") for the selected address. Null when
 * there is no located address or it isn't serviceable; falls back to
 * DEFAULT_ETA_TEXT when the estimate request fails.
 */
export function useDeliveryEta(cartItemCount = 1): string | null {
  const { selectedAddress } = useAddress();
  const latitude = selectedAddress?.latitude;
  const longitude = selectedAddress?.longitude;
  const [etaText, setEtaText] = useState<string | null>(null);

  useEffect(() => {
    if (!latitude || !longitude) {
      setEtaText(null);
      return undefined;
    }
    let cancelled = false;
    deliveryApi
      .getEstimateForLocation({ latitude, longitude, cartItemCount })
      .then(est => {
        if (!cancelled) setEtaText(est ? etaTextFromEstimate(est) || DEFAULT_ETA_TEXT : null);
      })
      .catch(() => {
        if (!cancelled) setEtaText(DEFAULT_ETA_TEXT);
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, cartItemCount]);

  return etaText;
}

export default useDeliveryEta;
