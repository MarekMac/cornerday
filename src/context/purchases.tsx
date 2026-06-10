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
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('users').update({ is_premium: premium }).eq('id', user.id);
  }
}

async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin ?? false;
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
      try {
        Purchases.configure({ apiKey: REVENUECAT_API_KEY });

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await Purchases.logIn(user.id);
          isAdminRef.current = await fetchIsAdmin(user.id);
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
      try {
        if (event === 'SIGNED_IN' && session?.user) {
          await Purchases.logIn(session.user.id);
          const [info, admin] = await Promise.all([
            Purchases.getCustomerInfo(),
            fetchIsAdmin(session.user.id),
          ]);
          isAdminRef.current = admin;
          const premium = checkPremium(info) || admin;
          setIsPremium(premium);
          await syncToSupabase(premium);
        } else if (event === 'SIGNED_OUT') {
          await Purchases.logOut();
          isAdminRef.current = false;
          setIsPremium(false);
        }
      } catch (e) {
        console.warn('[RevenueCat] auth change error:', e);
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
