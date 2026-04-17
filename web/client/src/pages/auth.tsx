import { useMemo, useState } from "react";
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

  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const t = useMemo(
    () =>
      locale === "es"
        ? {
            tabLogin: "Entrar",
            tabRegister: "Registrarse",
            welcomeBack: "Bienvenido de nuevo",
            signInSubtitle: "Accede a tu cuenta Vesta AI",
            createTitle: "Crear cuenta",
            createSubtitle: "Empieza a analizar el mercado inmobiliario en España",
            emailLabel: "Correo",
            passwordLabel: "Contraseña",
            usernameLabel: "Usuario",
            emailPh: "tu@correo.com",
            passwordPh: "••••••••",
            usernamePh: "usuario",
            passwordMinPh: "Mín. 6 caracteres",
            signIn: "Entrar",
            createAccount: "Crear cuenta",
            emailRequired: "Correo obligatorio",
            passwordRequired: "Contraseña obligatoria",
            loginFailed: "Error al iniciar sesión. Comprueba tus datos.",
            registerFailed: "Error al registrarse. Inténtalo de nuevo.",
          }
        : {
            tabLogin: "Login",
            tabRegister: "Register",
            welcomeBack: "Welcome back",
            signInSubtitle: "Sign in to your Vesta AI account",
            createTitle: "Create account",
            createSubtitle: "Start analyzing Spanish real estate",
            emailLabel: "Email",
            passwordLabel: "Password",
            usernameLabel: "Username",
            emailPh: "you@example.com",
            passwordPh: "••••••••",
            usernamePh: "johndoe",
            passwordMinPh: "Min. 6 characters",
            signIn: "Sign in",
            createAccount: "Create account",
            emailRequired: "Email required",
            passwordRequired: "Password required",
            loginFailed: "Login failed. Check your credentials.",
            registerFailed: "Registration failed. Try again.",
          },
    [locale],
  );

  const runLogin = async (values: { email: string; password: string }) => {
    setLoginError("");
    setLoginLoading(true);
    try {
      await login(values.email, values.password);
      navigate("/");
    } catch (err: any) {
      setLoginError(err.message || t.loginFailed);
    } finally {
      setLoginLoading(false);
    }
  };

  const runRegister = async (values: { username: string; email: string; password: string }) => {
    setRegError("");
    setRegLoading(true);
    try {
      await register(values.username, values.email, values.password);
      navigate("/");
    } catch (err: any) {
      setRegError(err.message || t.registerFailed);
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
                label: <span data-testid="tab-login">{t.tabLogin}</span>,
                children: (
                  <div className="pt-2">
                    <Title level={4} style={{ marginBottom: 4 }}>
                      {t.welcomeBack}
                    </Title>
                    <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                      {t.signInSubtitle}
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
                    <Form layout="vertical" onFinish={(v) => void runLogin(v)}>
                      <Form.Item label={t.emailLabel} name="email" rules={[{ required: true, message: t.emailRequired }]}>
                        <Input
                          id="login-email"
                          type="email"
                          placeholder={t.emailPh}
                          autoComplete="email"
                          data-testid="login-email"
                        />
                      </Form.Item>
                      <Form.Item
                        label={t.passwordLabel}
                        name="password"
                        rules={[{ required: true, message: t.passwordRequired }]}
                      >
                        <Input.Password
                          id="login-password"
                          placeholder={t.passwordPh}
                          autoComplete="current-password"
                          data-testid="login-password"
                        />
                      </Form.Item>
                      <Button type="primary" htmlType="submit" block loading={loginLoading} data-testid="login-submit">
                        {t.signIn}
                      </Button>
                    </Form>
                  </div>
                ),
              },
              {
                key: "register",
                label: <span data-testid="tab-register">{t.tabRegister}</span>,
                children: (
                  <div className="pt-2">
                    <Title level={4} style={{ marginBottom: 4 }}>
                      {t.createTitle}
                    </Title>
                    <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                      {t.createSubtitle}
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
                    <Form layout="vertical" onFinish={(v) => void runRegister(v)}>
                      <Form.Item label={t.usernameLabel} name="username" rules={[{ required: true, min: 2 }]}>
                        <Input
                          id="reg-username"
                          placeholder={t.usernamePh}
                          autoComplete="username"
                          data-testid="reg-username"
                        />
                      </Form.Item>
                      <Form.Item label={t.emailLabel} name="email" rules={[{ required: true, type: "email" }]}>
                        <Input
                          id="reg-email"
                          type="email"
                          placeholder={t.emailPh}
                          autoComplete="email"
                          data-testid="reg-email"
                        />
                      </Form.Item>
                      <Form.Item label={t.passwordLabel} name="password" rules={[{ required: true, min: 6 }]}>
                        <Input.Password
                          id="reg-password"
                          placeholder={t.passwordMinPh}
                          autoComplete="new-password"
                          data-testid="reg-password"
                        />
                      </Form.Item>
                      <Button type="primary" htmlType="submit" block loading={regLoading} data-testid="register-submit">
                        {t.createAccount}
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
