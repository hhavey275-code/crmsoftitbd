import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const TechBackground = lazy(() => import("@/components/TechBackground"));

/* Cute animated mascot that covers eyes when typing password */
function RobotMascot({ isCovering }: { isCovering: boolean }) {
  return (
    <div className="mx-auto mb-4 relative w-32 h-32 select-none">
      {/* Antenna */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-3 w-1 h-5 bg-gradient-to-t from-slate-400 to-slate-300 rounded-full" />
      <div className={`absolute left-1/2 -translate-x-1/2 -top-5 w-3 h-3 rounded-full transition-all duration-500 ${isCovering ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"}`} />
      
      {/* Head */}
      <div className="w-32 h-28 rounded-2xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 shadow-lg border border-slate-300 dark:border-slate-500 relative overflow-hidden">
        {/* Screen face */}
        <div className="absolute inset-2 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center gap-2">
          {/* Eyes row */}
          <div className="flex gap-6 items-center">
            {/* Left eye */}
            <div className={`relative transition-all duration-400 ease-in-out ${isCovering ? "w-6 h-1" : "w-6 h-6"} rounded-sm bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.6)] flex items-center justify-center`}>
              {!isCovering && <div className="w-2 h-2 rounded-full bg-slate-900" />}
            </div>
            {/* Right eye */}
            <div className={`relative transition-all duration-400 ease-in-out ${isCovering ? "w-6 h-1" : "w-6 h-6"} rounded-sm bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.6)] flex items-center justify-center`}>
              {!isCovering && <div className="w-2 h-2 rounded-full bg-slate-900" />}
            </div>
          </div>
          {/* Mouth */}
          <div className={`flex gap-0.5 transition-all duration-300 ${isCovering ? "opacity-100" : "opacity-70"}`}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`w-2 h-1.5 rounded-sm transition-all duration-300 ${isCovering ? "bg-red-400/80 h-1" : "bg-cyan-400/60"}`} />
            ))}
          </div>
          {/* X eyes overlay when covering */}
          {isCovering && (
            <div className="absolute inset-0 flex items-center justify-center gap-6 pb-3">
              <span className="text-red-400 text-lg font-bold drop-shadow-[0_0_6px_rgba(248,113,113,0.8)]">✕</span>
              <span className="text-red-400 text-lg font-bold drop-shadow-[0_0_6px_rgba(248,113,113,0.8)]">✕</span>
            </div>
          )}
        </div>
        {/* Bolts */}
        <div className="absolute top-1 left-0.5 w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
        <div className="absolute top-1 right-0.5 w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
        <div className="absolute bottom-1 left-0.5 w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
        <div className="absolute bottom-1 right-0.5 w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
      </div>
      {/* Ears */}
      <div className="absolute left-[-6px] top-10 w-2.5 h-8 rounded-l-md bg-gradient-to-b from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700" />
      <div className="absolute right-[-6px] top-10 w-2.5 h-8 rounded-r-md bg-gradient-to-b from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700" />
    </div>
  );
}

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [monthlySpend, setMonthlySpend] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [tiktokProcessing, setTiktokProcessing] = useState(false);
  const navigate = useNavigate();
  const { logoUrl, siteName, welcomeTitle, welcomeNote } = useSiteSettings();

  // Auto-detect TikTok OAuth callback and exchange auth_code for token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authCode = params.get("auth_code");
    const state = params.get("state");
    if (authCode && state === "tiktok") {
      setTiktokProcessing(true);
      toast.info("TikTok auth code detected, exchanging for token...");
      (async () => {
        try {
          const { data, error } = await supabase.functions.invoke("tiktok-oauth", {
            body: { auth_code: authCode },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          if (data?.access_token) {
            await navigator.clipboard.writeText(data.access_token);
            toast.success("TikTok Access Token copied to clipboard! Use it to add your Business Center.", { duration: 10000 });
            console.log("TikTok OAuth result:", data);
          }
        } catch (err: any) {
          toast.error("TikTok token exchange failed: " + (err?.message || "Unknown error"));
          console.error("TikTok OAuth error:", err);
        }
        // Clean URL and redirect to dashboard
        window.history.replaceState({}, "", window.location.pathname);
        setTiktokProcessing(false);
      })();
    }
  }, []);

  // Redirect authenticated users to dashboard (but not while processing TikTok OAuth)
  if (!authLoading && user && !tiktokProcessing) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate("/dashboard");
      } else {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;

        // Update profile with business name and monthly spend
        if (signUpData.user) {
          await supabase.from("profiles").update({
            company: businessName || null,
            phone: phone || null,
            business_address: businessAddress || null,
            monthly_spend: monthlySpend || null,
          } as any).eq("user_id", signUpData.user.id);
        }
        toast.success("Account created! Please wait for admin approval after confirming your email.");
      }
    } catch (err: any) {
      const msg = err?.message || err?.error_description || "";
      if (!msg || msg === "{}" || msg.includes("timeout") || msg.includes("504") || msg.includes("non-2xx")) {
        toast.error("Server is busy. Please try again in a moment.");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background overflow-hidden">
      <Suspense fallback={null}>
        <TechBackground />
      </Suspense>

      <header className="relative z-10 h-14 flex items-center gap-3 border-b bg-card/80 backdrop-blur-sm px-6">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded object-contain" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-lg bg-card/90 backdrop-blur-md shadow-2xl border-border/50 rounded-3xl">
          <CardHeader className="pb-2">
            <div className="flex items-center mb-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-16 w-16 rounded-xl object-contain" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary">
                  <Zap className="h-8 w-8 text-primary-foreground" />
                </div>
              )}
            </div>
            <RobotMascot isCovering={isPasswordFocused} />
            <div className="mx-auto mt-2 rounded-lg bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600 px-5 py-2 shadow-[0_0_20px_rgba(6,182,212,0.4)]">
              <p className="text-sm font-bold text-white tracking-wide text-center">
                {welcomeTitle || (isLogin ? "Sign in to your account" : "Create a new account")}
              </p>
            </div>
            {welcomeNote && (
              <p className="text-xs text-muted-foreground text-center mt-2 px-4">{welcomeNote}</p>
            )}
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 px-8">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required />
                </div>
              )}
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your Company Ltd." required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
              </div>
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+880 1XXXXXXXXX" required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="businessAddress">Business / Residential Address</Label>
                  <Input id="businessAddress" value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} placeholder="123 Main St, City, Country" required />
                </div>
              )}
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="monthlySpend">Monthly Approx. Spending (USD)</Label>
                  <Select value={monthlySpend} onValueChange={setMonthlySpend}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select spending range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="$0 - $500">$0 - $500</SelectItem>
                      <SelectItem value="$500 - $2,000">$500 - $2,000</SelectItem>
                      <SelectItem value="$2,000 - $5,000">$2,000 - $5,000</SelectItem>
                      <SelectItem value="$5,000 - $10,000">$5,000 - $10,000</SelectItem>
                      <SelectItem value="$10,000+">$10,000+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3 px-8">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Please wait..." : isLogin ? "Sign In" : "Sign Up"}
              </Button>
              
              {isLogin && (
                <>
                  <div className="relative w-full">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const { error } = await lovable.auth.signInWithOAuth("google", {
                          redirect_uri: window.location.origin,
                        });
                        if (error) throw error;
                      } catch (err: any) {
                        toast.error(err?.message || "Google sign-in failed");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Sign in with Google
                  </Button>
                </>
              )}
              
              <button type="button" className="text-sm text-muted-foreground hover:text-primary transition-colors" onClick={() => setIsLogin(!isLogin)}>
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
