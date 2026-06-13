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
  } catch {}
}

async function fetchIsAdmin(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();
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

    const init = async () => {
      // Admin check is independent — RC failures must not block it
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          isAdminRef.current = await fetchIsAdmin(user.id);
          if (isAdminRef.current) setIsPremium(true);
        }
      } catch (e) {
        console.warn('[Admin check] init error:', e);
      }

      // RevenueCat init (can fail without affecting admin premium)
      try {
        Purchases.configure({ apiKey: REVENUECAT_API_KEY });

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          try {
            await Purchases.logIn(user.id);
          } catch (e) {
            console.warn('[RevenueCat] logIn error:', e);
          }
        }

        const [info, offeringsResult] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);

        const premium = checkPremium(info) || isAdminRef.current;
        setIsPremium(premium);
        await syncToSupabase(premium);

        if (offeringsResult.current) setOfferings(offeringsResult.current);
      } catch (e) {
        console.warn('[RevenueCat] init error:', e);
      } finally {
        setIsLoadingPurchases(false);
      }
    };

    init();

    Purchases.addCustomerInfoUpdateListener(async (info) => {
      const premium = checkPremium(info) || isAdminRef.current;
      setIsPremium(premium);
      await syncToSupabase(premium);
    });
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (Platform.OS === 'web') return;

      if (event === 'SIGNED_IN' && session?.user) {
        // Admin check first, independently
        isAdminRef.current = await fetchIsAdmin(session.user.id);
        if (isAdminRef.current) setIsPremium(true);

        try {
          await Purchases.logIn(session.user.id);
          const info = await Purchases.getCustomerInfo();
          const premium = checkPremium(info) || isAdminRef.current;
          setIsPremium(premium);
          await syncToSupabase(premium);
        } catch (e) {
          console.warn('[RevenueCat] auth change error:', e);
        }
      } else if (event === 'SIGNED_OUT') {
        try { await Purchases.logOut(); } catch {}
        isAdminRef.current = false;
        setIsPremium(false);
      }
    });
    return () => subscription.unsubscribe();
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
