import { useState, useEffect, useCallback } from 'react';

export const useTimer = (initialSeconds, onExpire) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((s) => s - 1);
      }, 1000);
    } else if (seconds === 0 && isActive) {
      if (onExpire) {
        onExpire();
      }
    }
    return () => clearInterval(interval);
  }, [isActive, seconds, onExpire]);

  const start = useCallback(() => setIsActive(true), []);
  const pause = useCallback(() => setIsActive(false), []);
  const reset = useCallback((newSeconds) => {
    setSeconds(newSeconds || initialSeconds);
    setIsActive(false);
  }, [initialSeconds]);

  return { seconds, isActive, start, pause, reset };
};
