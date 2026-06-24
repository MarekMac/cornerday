let _refresh: (() => void) | null = null;
export const registerHomeRefresh = (cb: () => void) => { _refresh = cb; };
export const requestHomeRefresh = () => { _refresh?.(); };
