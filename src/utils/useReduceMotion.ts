import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Follows the OS "reduce motion" setting so looping decorative animations can
 * be switched off. Returns `false` until the initial async read resolves.
 */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => {
      if (alive) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export default useReduceMotion;
