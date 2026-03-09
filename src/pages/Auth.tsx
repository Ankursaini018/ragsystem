import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Sparkles, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const navigate = useNavigate();
  const { setGuest } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Signup state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupError, setSignupError] = useState("");

  // Reset state
  const [resetEmail, setResetEmail] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Please fill in all fields.");
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    setIsLoading(false);
    if (error) {
      setLoginError(error.message);
    } else {
      navigate("/chat");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError("");
    if (!signupEmail.trim() || !signupPassword || !signupConfirm) {
      setSignupError("Please fill in all fields.");
      return;
    }
    if (signupPassword.length < 6) {
      setSignupError("Password must be at least 6 characters.");
      return;
    }
    if (signupPassword !== signupConfirm) {
      setSignupError("Passwords do not match.");
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPassword,
      options: { emailRedirectTo: window.location.origin },
    });
    setIsLoading(false);
    if (error) {
      setSignupError(error.message);
    } else {
      toast({
        title: "Account created",
        description: "Check your email for a confirmation link, then log in.",
      });
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email sent", description: "Check your inbox for a password reset link." });
      setShowReset(false);
    }
  };

  const handleGuest = () => {
    setGuest(true);
    navigate("/chat");
  };

  if (showReset) {
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center p-4">
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        </div>
        <div className="glass-card p-8 w-full max-w-md relative z-10">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-gradient">RAG System</span>
          </div>
          <h2 className="text-xl font-bold mb-2">Reset Password</h2>
          <p className="text-sm text-muted-foreground mb-6">Enter your email to receive a reset link.</p>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input id="reset-email" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send Reset Link
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setShowReset(false)}>
              Back to login
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-dark flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="glass-card p-8 w-full max-w-md relative z-10">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Database className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-gradient">RAG System</span>
        </div>

        <h1 className="text-2xl font-bold mb-1">
          <span className="text-gradient">Welcome</span>
        </h1>
        <p className="text-sm text-muted-foreground mb-6">Sign in to access your personal knowledge base.</p>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-muted/50 mb-6">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {loginError && <p className="text-sm text-destructive">{loginError}</p>}
              <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Login <ArrowRight className="w-4 h-4" /></>}
              </Button>
              <button type="button" className="text-xs text-muted-foreground hover:text-primary transition-colors w-full text-center" onClick={() => setShowReset(true)}>
                Forgot password?
              </button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input id="signup-password" type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} placeholder="Min 6 characters" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-confirm">Confirm Password</Label>
                <Input id="signup-confirm" type="password" value={signupConfirm} onChange={(e) => setSignupConfirm(e.target.value)} placeholder="Repeat password" />
              </div>
              {signupError && <p className="text-sm text-destructive">{signupError}</p>}
              <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Create Account <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Button variant="outline" className="w-full gap-2" onClick={handleGuest}>
          <Sparkles className="w-4 h-4" />
          Continue as Guest
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-3">
          Guest documents are shared and not private.
        </p>
      </div>
    </div>
  );
};

export default Auth;
