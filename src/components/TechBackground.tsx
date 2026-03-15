import { useEffect, useRef } from "react";

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;

    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];
    const lines: { x: number; y: number; angle: number; length: number; speed: number; opacity: number }[] = [];

    const resize = () => {
      width = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      height = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    const init = () => {
      resize();
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      // Create particles
      for (let i = 0; i < 60; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: Math.random() * 2.5 + 1,
          opacity: Math.random() * 0.4 + 0.1,
        });
      }

      // Create circuit-like lines
      for (let i = 0; i < 15; i++) {
        lines.push({
          x: Math.random() * w,
          y: Math.random() * h,
          angle: (Math.floor(Math.random() * 4) * Math.PI) / 2,
          length: Math.random() * 100 + 50,
          speed: Math.random() * 0.3 + 0.1,
          opacity: Math.random() * 0.15 + 0.05,
        });
      }
    };

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      // Draw connection lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0, 100, 224, ${0.08 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw & update particles
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

      // Draw circuit lines
      for (const l of lines) {
        const endX = l.x + Math.cos(l.angle) * l.length;
        const endY = l.y + Math.sin(l.angle) * l.length;

        ctx.beginPath();
        ctx.strokeStyle = `rgba(0, 100, 224, ${l.opacity})`;
        ctx.lineWidth = 1;
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Small node at end
        ctx.beginPath();
        ctx.arc(endX, endY, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 100, 224, ${l.opacity + 0.1})`;
        ctx.fill();

        // Move line slowly
        l.x += Math.cos(l.angle) * l.speed;
        l.y += Math.sin(l.angle) * l.speed;
        if (l.x < -100 || l.x > w + 100 || l.y < -100 || l.y > h + 100) {
          l.x = Math.random() * w;
          l.y = Math.random() * h;
          l.angle = (Math.floor(Math.random() * 4) * Math.PI) / 2;
        }
      }

      // Rotating hexagon grid overlay
      const time = Date.now() * 0.0003;
      const cx = w / 2;
      const cy = h / 2;
      const hexSize = 40;
      for (let row = -6; row <= 6; row++) {
        for (let col = -8; col <= 8; col++) {
          const hx = cx + col * hexSize * 1.75 + (row % 2) * hexSize * 0.875;
          const hy = cy + row * hexSize * 1.5;
          const dist = Math.sqrt((hx - cx) ** 2 + (hy - cy) ** 2);
          const pulse = Math.sin(time * 2 + dist * 0.01) * 0.5 + 0.5;
          
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i + time;
            const px = hx + Math.cos(angle) * hexSize * 0.4;
            const py = hy + Math.sin(angle) * hexSize * 0.4;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = `rgba(0, 100, 224, ${0.04 * pulse})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    init();
    draw();

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full -z-10"
      style={{ pointerEvents: "none" }}
    />
  );
}
