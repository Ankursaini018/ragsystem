import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useCredits() {
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch credits on mount and when user changes
  useEffect(() => {
    const fetchCredits = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCredits(null);
        setUserId(null);
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("user_credits")
        .select("credits_remaining")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Failed to fetch credits:", error);
        setCredits(0);
      } else {
        setCredits(data?.credits_remaining ?? 0);
      }
      setLoading(false);
    };

    fetchCredits();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchCredits();
    });

    return () => subscription.unsubscribe();
  }, []);

  const deductCredit = useCallback(async (): Promise<boolean> => {
    if (!userId || credits === null || credits <= 0) return false;

    const { error } = await supabase
      .from("user_credits")
      .update({ credits_remaining: credits - 1 })
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to deduct credit:", error);
      return false;
    }

    setCredits((prev) => (prev !== null ? prev - 1 : null));
    return true;
  }, [userId, credits]);

  return { credits, loading, deductCredit, hasCredits: (credits ?? 0) > 0 };
}
