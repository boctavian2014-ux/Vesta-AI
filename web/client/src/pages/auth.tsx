import { useState, FormEvent } from "react";
import { Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";

function VestaLogoFull() {
  return (
    <div className="flex flex-col items-center gap-3 mb-8">
      <svg
        width="56"
        height="56"
        viewBox="0 0 32 32"
        fill="none"
        aria-label="Vesta AI"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="32" height="32" rx="8" fill="hsl(38 70% 50%)" />
        <path
          d="M16 8L25 15V25H20V19H12V25H7V15L16 8Z"
          fill="white"
          fillOpacity="0.9"
        />
        <rect x="13.5" y="19" width="5" height="6" rx="1" fill="hsl(38 70% 50%)" />
      </svg>
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Vesta AI</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Real estate intelligence for Spain
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  const [, navigate] = useHashLocation();
  const { login, register } = useAuth();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      await login(loginEmail, loginPassword);
      navigate("/");
    } catch (err: any) {
      setLoginError(err.message || "Login failed. Check your credentials.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setRegError("");
    setRegLoading(true);
    try {
      await register(regUsername, regEmail, regPassword);
      navigate("/");
    } catch (err: any) {
      setRegError(err.message || "Registration failed. Try again.");
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <VestaLogoFull />

        <Card className="border-border shadow-lg">
          <Tabs defaultValue="login">
            <CardHeader className="pb-2">
              <TabsList className="w-full" data-testid="auth-tabs">
                <TabsTrigger value="login" className="flex-1" data-testid="tab-login">
                  Login
                </TabsTrigger>
                <TabsTrigger value="register" className="flex-1" data-testid="tab-register">
                  Register
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="pt-4">
              {/* Login Tab */}
              <TabsContent value="login" className="mt-0">
                <div className="mb-4">
                  <CardTitle className="text-lg">Welcome back</CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Sign in to your Vesta AI account
                  </CardDescription>
                </div>

                {loginError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{loginError}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      data-testid="login-email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      data-testid="login-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loginLoading}
                    data-testid="login-submit"
                  >
                    {loginLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in…
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* Register Tab */}
              <TabsContent value="register" className="mt-0">
                <div className="mb-4">
                  <CardTitle className="text-lg">Create account</CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Start analyzing Spanish real estate
                  </CardDescription>
                </div>

                {regError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{regError}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-username">Username</Label>
                    <Input
                      id="reg-username"
                      type="text"
                      placeholder="johndoe"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      required
                      minLength={2}
                      data-testid="reg-username"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="you@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                      data-testid="reg-email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="Min. 6 characters"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                      minLength={6}
                      data-testid="reg-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={regLoading}
                    data-testid="register-submit"
                  >
                    {regLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account…
                      </>
                    ) : (
                      "Create account"
                    )}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
          Continuând, confirmi că ai citit{" "}
          <Link
            href="/legal/terms"
            className="text-primary underline underline-offset-2 hover:text-primary/90"
          >
            Termenii și condițiile
          </Link>{" "}
          și{" "}
          <Link
            href="/legal/privacy"
            className="text-primary underline underline-offset-2 hover:text-primary/90"
          >
            Politica de confidențialitate
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
