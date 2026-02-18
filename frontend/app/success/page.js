import Link from "next/link";

export default function SuccessPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Plată reușită</h1>
      <p style={{ color: "#64748b", marginBottom: 24 }}>
        Raportul Nota Simple a fost comandat. Vei primi un email când este gata.
      </p>
      <Link
        href="/"
        style={{
          padding: "12px 24px",
          background: "#6772e5",
          color: "white",
          textDecoration: "none",
          borderRadius: 8,
          fontWeight: 600,
        }}
      >
        Înapoi la hartă
      </Link>
    </div>
  );
}
