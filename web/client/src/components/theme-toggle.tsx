import { useState, useEffect } from "react";
import { SunOutlined, MoonOutlined } from "@ant-design/icons";
import { Button } from "antd";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return (
        window.matchMedia("(prefers-color-scheme: dark)").matches ||
        document.documentElement.classList.contains("dark")
      );
    }
    return true;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  return (
    <Button
      type="text"
      icon={isDark ? <SunOutlined /> : <MoonOutlined />}
      onClick={() => setIsDark((prev) => !prev)}
      data-testid="theme-toggle"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="!h-9 !w-9 !min-w-9 text-muted-foreground"
    />
  );
}
