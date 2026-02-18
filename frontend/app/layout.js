import "./globals.css";

export const metadata = {
  title: "OpenHouse Spain – Rapoarte Nota Simple",
  description: "Identifică proprietăți și comandă raportul proprietar în Spania.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
