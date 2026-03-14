// ============================================================
// NOVA Core — Admin Login Page
// /admin/login
// Single input field for admin secret. On match, sets httpOnly
// cookie and redirects to /admin/health. Generic error on failure.
// ============================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminLogin() {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });

      if (res.ok) {
        navigate("/admin/health");
      } else {
        setError("Authentication failed.");
        setSecret("");
      }
    } catch {
      setError("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>NOVA Core Admin</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Admin secret"
            autoFocus
            style={styles.input}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading || !secret} style={styles.button}>
            {loading ? "Authenticating..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "#0D0D0C",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: {
    background: "#1E1E1C",
    border: "1px solid #2A2A28",
    borderRadius: 8,
    padding: "48px 40px",
    width: 360,
    textAlign: "center",
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 32,
    letterSpacing: "0.02em",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    background: "#0D0D0C",
    border: "1px solid #2A2A28",
    borderRadius: 6,
    color: "#fff",
    fontSize: 14,
    fontFamily: "system-ui, -apple-system, sans-serif",
    outline: "none",
    boxSizing: "border-box",
  },
  error: {
    color: "#A63030",
    fontSize: 13,
    marginTop: 12,
    marginBottom: 0,
  },
  button: {
    width: "100%",
    padding: "12px 16px",
    marginTop: 20,
    background: "#534AB7",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
};
