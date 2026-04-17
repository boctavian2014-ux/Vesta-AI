import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Alert, Button, Card, Form, Input, Space, Tabs, Typography } from "antd";
import { AlertCircle } from "lucide-react";
import { VestaBrandLogoAuth } from "@/components/vesta-brand-logo";
import { useUiLocale } from "@/lib/ui-locale";

const { Title, Text } = Typography;

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { login, register } = useAuth();
  const { locale, setLocale } = useUiLocale();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const runLogin = async () => {
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

  const runRegister = async () => {
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
    <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-2 flex justify-end">
          <Space.Compact size="small">
            <Button type={locale === "en" ? "primary" : "default"} onClick={() => setLocale("en")}>
              EN
            </Button>
            <Button type={locale === "es" ? "primary" : "default"} onClick={() => setLocale("es")}>
              ES
            </Button>
          </Space.Compact>
        </div>
        <VestaBrandLogoAuth />

        <Card className="glass-card-strong border-border shadow-lg">
          <Tabs
            defaultActiveKey="login"
            data-testid="auth-tabs"
            items={[
              {
                key: "login",
                label: <span data-testid="tab-login">Login</span>,
                children: (
                  <div className="pt-2">
                    <Title level={4} style={{ marginBottom: 4 }}>
                      Welcome back
                    </Title>
                    <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                      Sign in to your Vesta AI account
                    </Text>
                    {loginError ? (
                      <Alert
                        type="error"
                        showIcon
                        icon={<AlertCircle className="h-4 w-4" />}
                        message={loginError}
                        className="mb-4"
                      />
                    ) : null}
                    <Form layout="vertical" onFinish={() => void runLogin()}>
                      <Form.Item label="Email" name="email" rules={[{ required: true, message: "Email required" }]}>
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="you@example.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          data-testid="login-email"
                        />
                      </Form.Item>
                      <Form.Item label="Password" name="password" rules={[{ required: true, message: "Password required" }]}>
                        <Input.Password
                          id="login-password"
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          data-testid="login-password"
                        />
                      </Form.Item>
                      <Button type="primary" htmlType="submit" block loading={loginLoading} data-testid="login-submit">
                        Sign in
                      </Button>
                    </Form>
                  </div>
                ),
              },
              {
                key: "register",
                label: <span data-testid="tab-register">Register</span>,
                children: (
                  <div className="pt-2">
                    <Title level={4} style={{ marginBottom: 4 }}>
                      Create account
                    </Title>
                    <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                      Start analyzing Spanish real estate
                    </Text>
                    {regError ? (
                      <Alert
                        type="error"
                        showIcon
                        icon={<AlertCircle className="h-4 w-4" />}
                        message={regError}
                        className="mb-4"
                      />
                    ) : null}
                    <Form layout="vertical" onFinish={() => void runRegister()}>
                      <Form.Item label="Username" name="username" rules={[{ required: true, min: 2 }]}>
                        <Input
                          id="reg-username"
                          placeholder="johndoe"
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value)}
                          data-testid="reg-username"
                        />
                      </Form.Item>
                      <Form.Item label="Email" name="email" rules={[{ required: true, type: "email" }]}>
                        <Input
                          id="reg-email"
                          type="email"
                          placeholder="you@example.com"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          data-testid="reg-email"
                        />
                      </Form.Item>
                      <Form.Item label="Password" name="password" rules={[{ required: true, min: 6 }]}>
                        <Input.Password
                          id="reg-password"
                          placeholder="Min. 6 characters"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          data-testid="reg-password"
                        />
                      </Form.Item>
                      <Button type="primary" htmlType="submit" block loading={regLoading} data-testid="register-submit">
                        Create account
                      </Button>
                    </Form>
                  </div>
                ),
              },
            ]}
          />
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
          {locale === "es" ? "Al continuar, confirmas que has leído " : "By continuing, you confirm you have read "}
          <Link href="/legal/terms" className="text-primary underline underline-offset-2 hover:text-primary/90">
            {locale === "es" ? "Términos y condiciones" : "Terms and conditions"}
          </Link>{" "}
          {locale === "es" ? "y " : "and "}
          <Link href="/legal/privacy" className="text-primary underline underline-offset-2 hover:text-primary/90">
            {locale === "es" ? "Política de privacidad" : "Privacy policy"}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
