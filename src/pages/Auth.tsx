import { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const TechBackground = lazy(() => import("@/components/TechBackground"));

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
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
      {/* 3D Tech Background */}
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
        <Card className="w-full max-w-md bg-card/90 backdrop-blur-md shadow-2xl border-border/50">
          <CardHeader className="text-center">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="mx-auto mb-4 h-24 w-24 rounded-xl object-contain" />
            ) : (
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-xl bg-primary">
                <Zap className="h-12 w-12 text-primary-foreground" />
              </div>
            )}
            <CardTitle className="text-2xl">{welcomeTitle || "Welcome"}</CardTitle>
            <CardDescription>
              {welcomeNote || (isLogin ? "Sign in to your account" : "Create a new account")}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
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
