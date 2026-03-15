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
function EyeMascot({ isCovering }: { isCovering: boolean }) {
  return (
    <div className="mx-auto mb-4 relative w-28 h-28">
      {/* Face */}
      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 shadow-lg flex items-center justify-center relative overflow-visible">
        {/* Eyes */}
        <div className="flex gap-4 relative z-10">
          <div className={`w-5 h-5 rounded-full bg-white flex items-center justify-center transition-all duration-300 ${isCovering ? "scale-y-[0.1]" : ""}`}>
            <div className={`w-2.5 h-2.5 rounded-full bg-gray-900 transition-all duration-300 ${isCovering ? "opacity-0" : ""}`} />
          </div>
          <div className={`w-5 h-5 rounded-full bg-white flex items-center justify-center transition-all duration-300 ${isCovering ? "scale-y-[0.1]" : ""}`}>
            <div className={`w-2.5 h-2.5 rounded-full bg-gray-900 transition-all duration-300 ${isCovering ? "opacity-0" : ""}`} />
          </div>
        </div>
        {/* Hands covering eyes */}
        <div
          className={`absolute left-1 z-20 w-10 h-7 rounded-full bg-gradient-to-br from-blue-300 to-blue-500 shadow-md transition-all duration-500 ease-in-out ${
            isCovering ? "top-[38%] opacity-100" : "top-[80%] opacity-0"
          }`}
        />
        <div
          className={`absolute right-1 z-20 w-10 h-7 rounded-full bg-gradient-to-br from-blue-300 to-blue-500 shadow-md transition-all duration-500 ease-in-out ${
            isCovering ? "top-[38%] opacity-100" : "top-[80%] opacity-0"
          }`}
        />
        {/* Mouth */}
        <div className={`absolute bottom-5 w-6 h-3 rounded-b-full border-b-2 border-white/60 transition-all duration-300 ${isCovering ? "w-4 h-2 bottom-5" : ""}`} />
      </div>
    </div>
  );
}

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [monthlySpend, setMonthlySpend] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const navigate = useNavigate();
  const { logoUrl, welcomeTitle, welcomeNote } = useSiteSettings();

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
          <CardHeader className="text-center pb-2">
            {logoUrl && (
              <img src={logoUrl} alt="Logo" className="mx-auto mb-2 h-24 w-24 rounded-xl object-contain" />
            )}
            <EyeMascot isCovering={isPasswordFocused} />
            <CardTitle className="text-2xl">{welcomeTitle || "Welcome"}</CardTitle>
            <CardDescription className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 text-base drop-shadow-[0_0_10px_rgba(0,150,255,0.5)]">
              {welcomeNote || (isLogin ? "Sign in to your account" : "Create a new account")}
            </CardDescription>
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
