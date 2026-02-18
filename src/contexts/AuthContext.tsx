import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { getStaffSession, StaffSession } from "@/lib/staffSession";

type UserType = "boss" | "staff" | null;

interface AuthContextValue {
  userType: UserType;
  bossUser: User | null;
  bossSession: Session | null;
  staffSession: StaffSession | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  userType: null,
  bossUser: null,
  bossSession: null,
  staffSession: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [bossUser, setBossUser] = useState<User | null>(null);
  const [bossSession, setBossSession] = useState<Session | null>(null);
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check staff session first
    const staff = getStaffSession();
    if (staff) {
      setStaffSession(staff);
    }

    // Check boss session
    supabase.auth.getSession().then(({ data }) => {
      setBossSession(data.session);
      setBossUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setBossSession(session);
      setBossUser(session?.user ?? null);
      if (session) {
        // Boss logged in — clear any staff session
        import("@/lib/staffSession").then(({ clearStaffSession }) => {
          clearStaffSession();
          setStaffSession(null);
        });
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const userType: UserType = bossUser ? "boss" : staffSession ? "staff" : null;

  const signOut = async () => {
    if (bossUser) {
      await supabase.auth.signOut();
    }
    import("@/lib/staffSession").then(({ clearStaffSession }) => {
      clearStaffSession();
      setStaffSession(null);
    });
  };

  return (
    <AuthContext.Provider
      value={{ userType, bossUser, bossSession, staffSession, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
