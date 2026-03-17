import { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  const navigate = useNavigate();
  const { logoUrl, siteName } = useSiteSettings();

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
            monthly_spend: monthlySpend || null,
          } as any).eq("user_id", signUpData.user.id);
        }
        toast.success("Account created! Please wait for admin approval after confirming your email.");
      }
    } catch (err: any) {
      toast.error(err.message);
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
                {isLogin ? "Sign in to your account" : "Create a new account"}
              </p>
            </div>
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
