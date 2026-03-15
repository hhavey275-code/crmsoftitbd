import { useEffect, useRef } from "react";

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const dpr = window.devicePixelRatio || 1;

    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];
    const circuitLines: { x: number; y: number; angle: number; length: number; speed: number; opacity: number }[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const init = () => {
      resize();
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      particles.length = 0;
      circuitLines.length = 0;

      for (let i = 0; i < 70; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          size: Math.random() * 2.5 + 1,
          opacity: Math.random() * 0.5 + 0.15,
        });
      }

      for (let i = 0; i < 18; i++) {
        circuitLines.push({
          x: Math.random() * w,
          y: Math.random() * h,
          angle: (Math.floor(Math.random() * 4) * Math.PI) / 2,
          length: Math.random() * 120 + 40,
          speed: Math.random() * 0.4 + 0.1,
          opacity: Math.random() * 0.18 + 0.05,
        });
      }
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      // Connection lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0, 100, 224, ${0.1 * (1 - dist / 160)})`;
            ctx.lineWidth = 0.6;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 100, 224, ${p.opacity})`;
        ctx.fill();
      }

      // Circuit lines
      for (const l of circuitLines) {
        const endX = l.x + Math.cos(l.angle) * l.length;
        const endY = l.y + Math.sin(l.angle) * l.length;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0, 100, 224, ${l.opacity})`;
        ctx.lineWidth = 1;
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(endX, endY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 100, 224, ${l.opacity + 0.1})`;
        ctx.fill();
        l.x += Math.cos(l.angle) * l.speed;
        l.y += Math.sin(l.angle) * l.speed;
        if (l.x < -120 || l.x > w + 120 || l.y < -120 || l.y > h + 120) {
          l.x = Math.random() * w;
          l.y = Math.random() * h;
          l.angle = (Math.floor(Math.random() * 4) * Math.PI) / 2;
        }
      }

      // Rotating hex grid
      const time = Date.now() * 0.0003;
      const cx = w / 2;
      const cy = h / 2;
      const hexSize = 45;
      for (let row = -7; row <= 7; row++) {
        for (let col = -10; col <= 10; col++) {
          const hx = cx + col * hexSize * 1.75 + (row % 2) * hexSize * 0.875;
          const hy = cy + row * hexSize * 1.5;
          const dist = Math.sqrt((hx - cx) ** 2 + (hy - cy) ** 2);
          const pulse = Math.sin(time * 2 + dist * 0.008) * 0.5 + 0.5;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i + time;
            const px = hx + Math.cos(angle) * hexSize * 0.4;
            const py = hy + Math.sin(angle) * hexSize * 0.4;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = `rgba(0, 100, 224, ${0.05 * pulse})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    init();
    draw();

    window.addEventListener("resize", () => { resize(); });
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none", zIndex: 0 }}
    />
  );
}
