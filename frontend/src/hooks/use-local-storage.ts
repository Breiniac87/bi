import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (val: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    const item = window.localStorage.getItem(key);
    if (item !== null) {
      try {
        const parsed = JSON.parse(item);
        setValue(parsed);
      } catch {
        // ignore errors
      }
    }
  }, [key]);

  const setValueAndStorage = (newValue: T) => {
    setValue(newValue);
    window.localStorage.setItem(key, JSON.stringify(newValue));
  };

  return [value, setValueAndStorage];
}

export function useLocalLocalDate(key: string, defaultValue: Date | undefined): [Date | undefined, (val: Date | undefined) => void] {
  const [value, setValue] = useState<Date | undefined>(defaultValue);

  useEffect(() => {
    const item = window.localStorage.getItem(key);
    if (item !== null) {
      try {
        const parsed = JSON.parse(item);
        if (parsed) {
          setValue(new Date(parsed));
        } else {
          setValue(undefined);
        }
      } catch {
        // ignore errors
      }
    }
  }, [key]);

  const setValueAndStorage = (newValue: Date | undefined) => {
    setValue(newValue);
    window.localStorage.setItem(key, JSON.stringify(newValue ? newValue.toISOString() : null));
  };

  return [value, setValueAndStorage];
}
