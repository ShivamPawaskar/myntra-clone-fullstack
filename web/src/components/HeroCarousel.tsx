"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SLIDES = [
  {
    title: "BIG FASHION FESTIVAL",
    subtitle: "50-90% OFF",
    tag: "On 5000+ Brands",
    img: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1400&h=450&fit=crop&auto=format",
    bg: "linear-gradient(90deg, #ff3f6c 0%, #ff7043 100%)",
    href: "/?q=dress",
  },
  {
    title: "MEN'S WARDROBE EDIT",
    subtitle: "FLAT 60% OFF",
    tag: "Shirts • Tees • Footwear",
    img: "https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=1400&h=450&fit=crop&auto=format",
    bg: "linear-gradient(90deg, #282c3f 0%, #535766 100%)",
    href: "/?category=men",
  },
  {
    title: "ETHNIC ELEGANCE",
    subtitle: "UP TO 80% OFF",
    tag: "Sarees • Kurtis • Lehengas",
    img: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1400&h=450&fit=crop&auto=format",
    bg: "linear-gradient(90deg, #7b2d8e 0%, #c2185b 100%)",
    href: "/?q=ethnic",
  },
];

export function HeroCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", overflow: "hidden", background: "var(--color-bg-muted)" }}>
      <div style={{ display: "flex", transition: "transform 0.6s ease", transform: `translateX(-${index * 100}%)` }}>
        {SLIDES.map((slide) => (
          <Link
            key={slide.title}
            href={slide.href}
            className="hero-slide"
            style={{
              minWidth: "100%",
              height: 360,
              position: "relative",
              display: "block",
              background: slide.bg,
              overflow: "hidden",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.img}
              alt={slide.title}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }}
            />
            <div className="hero-pad" style={{
              position: "relative",
              maxWidth: 1440,
              margin: "0 auto",
              height: "100%",
              padding: "0 64px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              color: "#fff",
            }}>
              <p className="hide-mobile" style={{ fontSize: 16, fontWeight: 600, letterSpacing: 2, marginBottom: 12, textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
                {slide.tag}
              </p>
              <h2 className="hero-title" style={{ fontSize: 48, fontWeight: 900, letterSpacing: -1, marginBottom: 8, textShadow: "0 2px 8px rgba(0,0,0,0.3)", lineHeight: 1.1 }}>
                {slide.title}
              </h2>
              <p className="hero-subtitle" style={{ fontSize: 36, fontWeight: 800, color: "#ffe600", marginBottom: 24, textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
                {slide.subtitle}
              </p>
              <span style={{
                display: "inline-block",
                width: "fit-content",
                background: "#fff",
                color: "#282c3f",
                padding: "12px 32px",
                borderRadius: "var(--radius-sm)",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: 0.5,
              }}>
                SHOP NOW →
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Dots */}
      <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8 }}>
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Slide ${i + 1}`}
            style={{
              width: i === index ? 24 : 8,
              height: 8,
              borderRadius: 4,
              border: "none",
              background: i === index ? "#fff" : "rgba(255,255,255,0.5)",
              cursor: "pointer",
              transition: "width 0.3s",
            }}
          />
        ))}
      </div>
    </div>
  );
}
