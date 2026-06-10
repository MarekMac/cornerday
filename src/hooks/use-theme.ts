import { useAppTheme } from '@/context/theme';

export { useAppTheme };

export function useTheme() {
  return useAppTheme().colors;
}
