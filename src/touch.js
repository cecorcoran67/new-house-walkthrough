// On-screen controls for touch screens: a joystick to walk, drag anywhere else to look.
// Touch pointers stay bound to the element they started on, so no explicit capture is needed.

const LOOK = 0.005; // radians per pixel dragged
const DEAD = 0.12; // joystick dead zone, as a fraction of its travel

export function initTouch(player, canvas, stick) {
  const knob = stick.firstElementChild;
  let stickId = null;
  let look = null; // { id, x, y } of the finger currently steering the view

  function moveStick(e) {
    const r = stick.getBoundingClientRect();
    const reach = (r.width - knob.offsetWidth) / 2;
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > reach) {
      dx *= reach / d;
      dy *= reach / d;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const live = d / reach > DEAD;
    player.stick.x = live ? dx / reach : 0;
    player.stick.y = live ? dy / reach : 0;
  }

  function releaseStick(e) {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = '';
    player.stick.x = player.stick.y = 0;
  }

  stick.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    stickId = e.pointerId;
    moveStick(e);
    e.preventDefault();
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) moveStick(e);
  });
  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);

  canvas.addEventListener('pointerdown', (e) => {
    if (player.locked || look) return;
    look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!look || e.pointerId !== look.id) return;
    player.look((e.clientX - look.x) * LOOK, (e.clientY - look.y) * LOOK);
    look.x = e.clientX;
    look.y = e.clientY;
  });
  const releaseLook = (e) => {
    if (look && e.pointerId === look.id) look = null;
  };
  canvas.addEventListener('pointerup', releaseLook);
  canvas.addEventListener('pointercancel', releaseLook);
  canvas.addEventListener('pointerleave', releaseLook);
}
