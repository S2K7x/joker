/*
  Buzz Rush — The Bee Game
  A flappy-style 2D canvas game.
*/

const canvas = document.querySelector('canvas.game');
const ctx = canvas.getContext('2d');

let frames = 0;
let gameStarted = false;
let gameOverFired = false;
let currentScore = 0;
let animationReq;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ── Game Objects ── //

const bee = {
  x: 50,
  y: canvas.height / 2,
  w: 34,
  h: 24,
  gravity: 0.25,
  velocity: 0,
  jump: -5.5,
  radius: 12,

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    // Rotate based on velocity for dive/climb effect
    const angle = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.velocity * 0.1)));
    ctx.rotate(angle);

    // Body (Yellow/Black stripes)
    ctx.fillStyle = '#FFD700'; // Yellow
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000'; // Black stripes
    ctx.fillRect(-4, -11, 4, 22);
    ctx.fillRect(4, -10, 4, 19);

    // Eye
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(10, -4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(11, -4, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Wings (animated)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    const wingY = (frames % 10 < 5) ? -15 : -8;
    ctx.beginPath();
    ctx.ellipse(-2, wingY, 8, 4, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },

  flap() {
    this.velocity = this.jump;
    // Small particle effect here? (Optional)
  },

  update() {
    this.velocity += this.gravity;
    this.y += this.velocity;

    // Floor collision
    if (this.y + this.radius >= canvas.height) {
      this.y = canvas.height - this.radius;
      triggerGameOver();
    }
    // Ceiling collision
    if (this.y - this.radius <= 0) {
      this.y = this.radius;
      this.velocity = 0;
    }
  },

  reset() {
    this.y = canvas.height / 2;
    this.velocity = 0;
  }
};

const honeycombs = {
  position: [],
  width: 60,
  gap: 160,
  dx: 3,

  draw() {
    for (let i = 0; i < this.position.length; i++) {
      let p = this.position[i];
      let topY = p.y;
      let bottomY = p.y + this.gap;

      // Draw Top honeycomb pillar
      this.drawPillar(p.x, 0, this.width, topY, true);
      // Draw Bottom honeycomb pillar
      this.drawPillar(p.x, bottomY, this.width, canvas.height - bottomY, false);
    }
  },

  drawPillar(x, y, w, h, isTop) {
    ctx.fillStyle = '#E6A817'; // Honey orange/gold
    ctx.fillRect(x, y, w, h);
    
    // Hexagon pattern overlay (simplified as borders)
    ctx.strokeStyle = '#C48A11';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    
    // Cap
    ctx.fillStyle = '#FFC125';
    let capH = 20;
    if (isTop) {
      ctx.fillRect(x - 5, h - capH, w + 10, capH);
    } else {
      ctx.fillRect(x - 5, y, w + 10, capH);
    }
  },

  update() {
    // Add new honeycomb every 100 frames
    if (frames % 100 === 0) {
      // Random gap position
      const minO = 50;
      const maxO = canvas.height - this.gap - 50;
      const maxYPos = minO + Math.random() * (maxO - minO);
      
      this.position.push({
        x: canvas.width,
        y: maxYPos,
        passed: false
      });
    }

    for (let i = 0; i < this.position.length; i++) {
      let p = this.position[i];
      
      // Move left
      p.x -= this.dx;

      // Collision detection
      // Top pipe
      if (bee.x + bee.radius > p.x && bee.x - bee.radius < p.x + this.width &&
          bee.y - bee.radius < p.y) {
        triggerGameOver();
      }
      // Bottom pipe
      if (bee.x + bee.radius > p.x && bee.x - bee.radius < p.x + this.width &&
          bee.y + bee.radius > p.y + this.gap) {
        triggerGameOver();
      }

      // Score increment
      if (p.x + this.width < bee.x && !p.passed) {
        currentScore++;
        p.passed = true;
        const scoreDOM = document.getElementById('score');
        if (scoreDOM) scoreDOM.innerText = currentScore.toString();
      }

      // Remove off-screen pipes
      if (p.x + this.width < 0) {
        this.position.shift();
        i--;
      }
    }
  },

  reset() {
    this.position = [];
  }
};

const background = {
  draw() {
    // Gradient sky
    let bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, '#87CEEB'); // Sky blue
    bgGradient.addColorStop(1, '#E0F6FF');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Simple clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    const c1x = (frames * 0.5) % (canvas.width + 200) - 100;
    ctx.beginPath(); ctx.arc(canvas.width - c1x, 100, 40, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(canvas.width - c1x + 40, 100, 30, 0, Math.PI*2); ctx.fill();
    
    const c2x = (frames * 0.3) % (canvas.width + 200) - 100;
    ctx.beginPath(); ctx.arc(canvas.width - c2x + 200, 250, 50, 0, Math.PI*2); ctx.fill();
  }
};

/* ── Game Loop ── */

function draw() {
  background.draw();
  honeycombs.draw();
  bee.draw();
}

function update() {
  bee.update();
  honeycombs.update();
}

function loop() {
  if (gameOverFired) return;
  update();
  draw();
  frames++;
  animationReq = requestAnimationFrame(loop);
}

function triggerGameOver() {
  if (gameOverFired) return;
  gameOverFired = true;
  cancelAnimationFrame(animationReq);
  
  if (typeof window.onGameOver === 'function') {
    window.onGameOver(currentScore);
  }
}

/* ── Public API ── */

window._startGame = function () {
  if (gameStarted) return;
  gameStarted = true;
  gameOverFired = false;
  currentScore = 0;
  frames = 0;
  
  const scoreDOM = document.getElementById('score');
  if (scoreDOM) scoreDOM.innerText = '0';

  bee.reset();
  honeycombs.reset();
  resize();
  
  // Initial draw before flap
  draw();
  
  loop(); // Start loop!
};

window._retryGame = function () {
  gameOverFired = false;
  currentScore = 0;
  frames = 0;
  
  const scoreDOM = document.getElementById('score');
  if (scoreDOM) scoreDOM.innerText = '0';

  bee.reset();
  honeycombs.reset();
  
  loop();
};

/* ── Input Handling ── */

function doFlap() {
  if (!gameStarted || gameOverFired) return;
  bee.flap();
}

window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    doFlap();
  }
});

canvas.addEventListener('mousedown', doFlap);
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  doFlap();
}, { passive: false });

const flapBtn = document.getElementById('flap-btn');
if (flapBtn) {
  flapBtn.addEventListener('click', doFlap);
  flapBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    doFlap();
  });
}
