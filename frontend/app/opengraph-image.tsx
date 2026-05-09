import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Zonycs — Buy & Sell Locally";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 60%, #ecfdf5 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Grid pattern overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(14,165,201,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,201,0.07) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Logo mark */}
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: 28,
            background: "linear-gradient(135deg, #0ea5c9 0%, #10b981 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 68,
            fontWeight: 800,
            marginBottom: 36,
            boxShadow: "0 24px 60px rgba(14,165,201,0.35)",
          }}
        >
          Z
        </div>
        {/* Brand name */}
        <div
          style={{
            fontSize: 80,
            fontWeight: 800,
            color: "#0f172a",
            letterSpacing: "-0.04em",
            marginBottom: 18,
          }}
        >
          Zonycs
        </div>
        {/* Tagline */}
        <div
          style={{
            fontSize: 30,
            color: "#475569",
            textAlign: "center",
            maxWidth: 680,
            lineHeight: 1.45,
          }}
        >
          Buy &amp; Sell Locally — with optional blockchain escrow
        </div>
        {/* Bottom pill */}
        <div
          style={{
            marginTop: 48,
            display: "flex",
            gap: 16,
          }}
        >
          {["Free Classifieds", "Secure Escrow", "Canada"].map((label) => (
            <div
              key={label}
              style={{
                borderRadius: 9999,
                border: "1.5px solid rgba(14,165,201,0.35)",
                background: "rgba(255,255,255,0.75)",
                padding: "10px 24px",
                fontSize: 20,
                fontWeight: 600,
                color: "#0369a1",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
