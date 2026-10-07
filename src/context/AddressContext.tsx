import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { addressApi } from '../services/address.service';
import type { ApiAddress } from '../services/address.service';
import { Storage } from '../api/storage';
import { mmkvStorage } from '../lib/storage';
import { showToast } from '../utils/toast';
import { getErrorMessage } from '../utils/apiError';
import { isValidAddressLine, isValidLandmark, isValidPlaceName, isValidPincode } from '../utils/validation';
import { geocodeAddressQuery, isValidCoordPair } from '../services/location.service';
import { storeApi } from '../services/store.service';
import { useAuth } from './AuthContext';

const SELECTED_ADDRESS_KEY = 'selectedAddressId';

/** Address shape used by screens — maps from API response. */
export interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
}

function toAddress(raw: ApiAddress): Address {
  return {
    id: raw._id,
    label: raw.label || 'Home',
    line1: raw.line1 || '',
    line2: raw.line2 || '',
    landmark: raw.landmark || '',
    city: raw.city || '',
    state: raw.state || '',
    pincode: raw.pincode || '',
    latitude: raw.latitude ?? 0,
    longitude: raw.longitude ?? 0,
    isDefault: Boolean(raw.isDefault),
  };
}

interface AddressContextType {
  addresses: Address[];
  loading: boolean;
  selectedAddressId: string;
  selectedAddress: Address | undefined;
  selectAddress: (id: string) => void;
  setDefaultAddress: (id: string) => Promise<void>;
  saveAddress: (draft: Omit<Address, 'id' | 'isDefault'> & { id?: string | null }) => Promise<boolean>;
  deleteAddress: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AddressContext = createContext<AddressContextType | undefined>(undefined);

export const AddressProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const accountId = user?.id || '';
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');


  const loadAddresses = useCallback(async () => {
    if (!Storage.getItem('accessToken')) {
      setAddresses([]);
      setSelectedAddressId('');
      return;
    }
    setLoading(true);
    try {
      const raw = await addressApi.listAddresses();
      const mapped = raw.map(toAddress);
      setAddresses(mapped);
      const remembered = mmkvStorage.getItem(SELECTED_ADDRESS_KEY);
      const defaultAddr = mapped.find(a => a.isDefault) || mapped[0];
      const nextId =
        (remembered && mapped.some(a => a.id === remembered) && remembered) ||
        defaultAddr?.id ||
        '';
      setSelectedAddressId(nextId);
      if (nextId) mmkvStorage.setItem(SELECTED_ADDRESS_KEY, nextId);
    } catch {
      // keep previous list
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-load when auth flips to true (OTP login) or clears on logout.
  useEffect(() => {
    setAddresses([]);
    setSelectedAddressId('');
    if (isAuthenticated) {
      loadAddresses();
    } else {
      setAddresses([]);
      setSelectedAddressId('');
      mmkvStorage.removeItem(SELECTED_ADDRESS_KEY);
    }
  }, [accountId, isAuthenticated, loadAddresses]);

  const selectedAddress = useMemo(
    () => addresses.find(a => a.id === selectedAddressId) || addresses.find(a => a.isDefault),
    [addresses, selectedAddressId],
  );

  const selectAddress = useCallback((id: string) => {
    setSelectedAddressId(id);
    mmkvStorage.setItem(SELECTED_ADDRESS_KEY, id);
  }, []);

  const setDefaultAddress = useCallback(async (id: string) => {
    try {
      await addressApi.setDefaultAddress(id);
      mmkvStorage.setItem(SELECTED_ADDRESS_KEY, id);
      await loadAddresses();
      showToast('Default address updated');
    } catch {
      showToast('Could not update default address', 'err');
    }
  }, [loadAddresses]);

  const saveAddress = useCallback(async (draft: Omit<Address, 'id' | 'isDefault'> & { id?: string | null }): Promise<boolean> => {
    // Same client rules as selorg-web-app AddressFormModal.
    if (!isValidAddressLine(draft.line1)) {
      showToast('Enter a house number and street (at least 3 characters)', 'err');
      return false;
    }
    // Line 2 is labelled optional (and optional on the server) — only check it when filled.
    if (draft.line2.trim() && !isValidAddressLine(draft.line2)) {
      showToast('Area or locality must be 3–120 characters', 'err');
      return false;
    }
    if (draft.landmark.trim() && !isValidLandmark(draft.landmark)) {
      showToast('Landmark must be 80 characters or less', 'err');
      return false;
    }
    if (!isValidPlaceName(draft.city)) {
      showToast('Enter a valid city', 'err');
      return false;
    }
    if (!isValidPlaceName(draft.state)) {
      showToast('Enter a valid state', 'err');
      return false;
    }
    if (!isValidPincode(draft.pincode)) {
      showToast('Enter a valid 6-digit PIN code', 'err');
      return false;
    }

    let latitude = draft.latitude;
    let longitude = draft.longitude;
    if (!isValidCoordPair(latitude, longitude)) {
      const query = [draft.line1, draft.line2, draft.city, draft.state, draft.pincode]
        .map(part => part.trim())
        .filter(Boolean)
        .join(', ');
      const resolved = await geocodeAddressQuery(query);
      if (!resolved || !isValidCoordPair(resolved.latitude, resolved.longitude)) {
        showToast('Use current location or drop a pin before saving. Delivery needs a map pin.', 'err');
        return false;
      }
      latitude = resolved.latitude;
      longitude = resolved.longitude;
    }

    try {
      const check = await storeApi.assign(latitude, longitude);
      if (check?.serviceable === false) {
        showToast(check.message || "We don't deliver to this location yet.", 'err');
        return false;
      }
      const payload = {
        label: draft.label,
        line1: draft.line1.trim(),
        line2: draft.line2.trim(),
        landmark: draft.landmark.trim() || undefined,
        city: draft.city.trim(),
        state: draft.state.trim(),
        pincode: draft.pincode.trim(),
        latitude,
        longitude,
      };
      const saved = draft.id
        ? await addressApi.updateAddress(draft.id, payload)
        : await addressApi.createAddress(payload);
      const addr = toAddress(saved);
      mmkvStorage.setItem(SELECTED_ADDRESS_KEY, addr.id);
      await loadAddresses();
      showToast('Address saved');
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not save address'), 'err');
      return false;
    }
  }, [loadAddresses]);

  const deleteAddress = useCallback(async (id: string) => {
    try {
      await addressApi.deleteAddress(id);
      if (mmkvStorage.getItem(SELECTED_ADDRESS_KEY) === id) {
        mmkvStorage.removeItem(SELECTED_ADDRESS_KEY);
      }
      await loadAddresses();
      showToast('Address deleted');
    } catch {
      showToast('Could not delete address', 'err');
    }
  }, [loadAddresses]);

  const value = useMemo<AddressContextType>(() => ({
    addresses, loading, selectedAddressId, selectedAddress,
    selectAddress, setDefaultAddress, saveAddress, deleteAddress, refresh: loadAddresses,
  }), [addresses, loading, selectedAddressId, selectedAddress, selectAddress, setDefaultAddress, saveAddress, deleteAddress, loadAddresses]);

  return <AddressContext.Provider value={value}>{children}</AddressContext.Provider>;
};

export const useAddress = () => {
  const ctx = useContext(AddressContext);
  if (!ctx) throw new Error('useAddress must be used within an AddressProvider');
  return ctx;
};
