import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { REVENUECAT_API_KEY, ENTITLEMENT_ID } from '@/constants/revenuecat';

interface PurchasesContextType {
  isPremium: boolean;
  isLoadingPurchases: boolean;
  offerings: PurchasesOffering | null;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  paywallVisible: boolean;
  showPaywall: () => void;
  hidePaywall: () => void;
}

const PurchasesContext = createContext<PurchasesContextType>({
  isPremium: false,
  isLoadingPurchases: true,
  offerings: null,
  purchasePackage: async () => false,
  restorePurchases: async () => false,
  paywallVisible: false,
  showPaywall: () => {},
  hidePaywall: () => {},
});

function checkPremium(info: CustomerInfo): boolean {
  return typeof info.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
}

async function syncToSupabase(premium: boolean) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('users').update({ is_premium: premium }).eq('id', user.id);
    }
  } catch (e) {
    console.warn('[syncToSupabase] error:', e);
  }
}

async function fetchIsAdmin(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle();
    return data?.is_admin ?? false;
  } catch {
    return false;
  }
}

export function PurchasesProvider({ children }: { children: ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(true);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const isAdminRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setIsLoadingPurchases(false);
      return;
    }

    let cancelled = false;

    const customerInfoHandler = async (info: CustomerInfo) => {
      if (cancelled) return;
      const premium = checkPremium(info) || isAdminRef.current;
      if (!cancelled) setIsPremium(premium);
      await syncToSupabase(premium);
    };

    const init = async () => {
      // Admin check is independent — RC failures must not block it
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          isAdminRef.current = await fetchIsAdmin(user.id);
          if (!cancelled && isAdminRef.current) setIsPremium(true);
        }
      } catch (e) {
        console.warn('[Admin check] init error:', e);
      }

      if (cancelled) return;

      // RevenueCat init (can fail without affecting admin premium)
      try {
        Purchases.configure({ apiKey: REVENUECAT_API_KEY });
        // Register listener only after configure() so the SDK singleton exists
        Purchases.addCustomerInfoUpdateListener(customerInfoHandler);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          try {
            await Purchases.logIn(user.id);
          } catch (e) {
            console.warn('[RevenueCat] logIn error:', e);
          }
        }

        if (cancelled) return;

        const info = await Purchases.getCustomerInfo();
        const premium = checkPremium(info) || isAdminRef.current;
        if (!cancelled) setIsPremium(premium);
        await syncToSupabase(premium);

        try {
          const offeringsResult = await Purchases.getOfferings();
          if (!cancelled && offeringsResult.current) setOfferings(offeringsResult.current);
        } catch (e) {
          console.warn('[RevenueCat] getOfferings error:', e);
        }
      } catch (e) {
        console.warn('[RevenueCat] init error:', e);
      } finally {
        if (!cancelled) setIsLoadingPurchases(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(customerInfoHandler);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (Platform.OS === 'web') return;

      if (event === 'SIGNED_IN' && session?.user) {
        // Skip re-login if RevenueCat already has this user (token refresh fires SIGNED_IN too)
        try {
          const existing = await Purchases.getCustomerInfo();
          if (existing.originalAppUserId === session.user.id) return;
        } catch (_) {}

        // Admin check first, independently
        isAdminRef.current = await fetchIsAdmin(session.user.id);
        if (!cancelled && isAdminRef.current) setIsPremium(true);

        try {
          await Purchases.logIn(session.user.id);
          const info = await Purchases.getCustomerInfo();
          const premium = checkPremium(info) || isAdminRef.current;
          if (!cancelled) setIsPremium(premium);
          await syncToSupabase(premium);
        } catch (e) {
          console.warn('[RevenueCat] auth change error:', e);
        }
      } else if (event === 'SIGNED_OUT') {
        try { await Purchases.logOut(); } catch (e) { console.warn('[RevenueCat] logOut error:', e); }
        isAdminRef.current = false;
        if (!cancelled) setIsPremium(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const purchasePackage = async (pkg: PurchasesPackage): Promise<boolean> => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const premium = checkPremium(customerInfo) || isAdminRef.current;
      setIsPremium(premium);
      await syncToSupabase(premium);
      if (premium) setPaywallVisible(false);
      return premium;
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Purchase failed', e.message ?? 'Something went wrong. Please try again.');
      }
      return false;
    }
  };

  const restorePurchases = async (): Promise<boolean> => {
    try {
      const info = await Purchases.restorePurchases();
      const premium = checkPremium(info) || isAdminRef.current;
      setIsPremium(premium);
      await syncToSupabase(premium);
      if (premium) {
        setPaywallVisible(false);
        Alert.alert('Restored!', 'Your Premium subscription has been restored.');
      } else {
        Alert.alert('Nothing to restore', 'No active Premium subscription was found for this account.');
      }
      return premium;
    } catch (e: any) {
      Alert.alert('Restore failed', e.message ?? 'Could not restore purchases. Please try again.');
      return false;
    }
  };

  return (
    <PurchasesContext.Provider value={{
      isPremium,
      isLoadingPurchases,
      offerings,
      purchasePackage,
      restorePurchases,
      paywallVisible,
      showPaywall: () => setPaywallVisible(true),
      hidePaywall: () => setPaywallVisible(false),
    }}>
      {children}
    </PurchasesContext.Provider>
  );
}

export const usePurchases = () => useContext(PurchasesContext);
