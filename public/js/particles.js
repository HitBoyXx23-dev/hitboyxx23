
const canvas = document.querySelector("#particles");

if (canvas) {
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let ratio = 1;
  let particles = [];
  let mouse = { x: -9999, y: -9999 };

  function resize() {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.min(
      120,
      Math.max(48, Math.floor((width * height) / 14500))
    );

    particles = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.35 + .35,
      speedX: (Math.random() - .5) * .12,
      speedY: Math.random() * -.16 - .035,
      alpha: Math.random() * .42 + .08,
      phase: Math.random() * Math.PI * 2,
      blue: index % 3 !== 0
    }));
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];

      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 95) {
          const opacity = (1 - distance / 95) * .055;
          ctx.strokeStyle = `rgba(93, 111, 220, ${opacity})`;
          ctx.lineWidth = .55;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (const particle of particles) {
      particle.phase += .012;
      particle.x += particle.speedX;
      particle.y += particle.speedY;

      const dx = particle.x - mouse.x;
      const dy = particle.y - mouse.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 110 && distance > 0) {
        const force = (110 - distance) / 110;
        particle.x += (dx / distance) * force * .35;
        particle.y += (dy / distance) * force * .35;
      }

      if (particle.y < -8) {
        particle.y = height + 8;
        particle.x = Math.random() * width;
      }

      if (particle.x < -8) particle.x = width + 8;
      if (particle.x > width + 8) particle.x = -8;

      const pulse = Math.sin(particle.phase) * .08;
      const alpha = Math.max(.03, particle.alpha + pulse);

      const gradient = ctx.createRadialGradient(
        particle.x,
        particle.y,
        0,
        particle.x,
        particle.y,
        particle.radius * 4
      );

      if (particle.blue) {
        gradient.addColorStop(0, `rgba(111, 143, 255, ${alpha})`);
        gradient.addColorStop(1, "rgba(65, 105, 225, 0)");
      } else {
        gradient.addColorStop(0, `rgba(164, 102, 232, ${alpha})`);
        gradient.addColorStop(1, "rgba(125, 74, 199, 0)");
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(
        particle.x,
        particle.y,
        particle.radius * 4,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillStyle = particle.blue
        ? `rgba(130, 154, 255, ${Math.min(.85, alpha + .2)})`
        : `rgba(180, 119, 239, ${Math.min(.85, alpha + .2)})`;

      ctx.beginPath();
      ctx.arc(
        particle.x,
        particle.y,
        particle.radius,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    drawConnections();
    requestAnimationFrame(draw);
  }

  window.addEventListener("mousemove", (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });

  window.addEventListener("mouseleave", () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  window.addEventListener("resize", resize);

  resize();
  draw();
}
