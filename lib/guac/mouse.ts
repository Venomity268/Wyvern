/* eslint-disable @typescript-eslint/no-explicit-any */

export function installMouseHandlers(
  client: any,
  Guacamole: any,
  displayEl: HTMLElement,
): { mouse: any; touchscreen?: any } {
  const mouse = new Guacamole.Mouse(displayEl);
  mouse.onEach(["mousedown", "mouseup", "mousemove", "mousewheel"], (e: { state: unknown }) => {
    client.sendMouseState(e.state, true);
  });

  let touchscreen: any;
  if (Guacamole.Touchscreen) {
    touchscreen = new Guacamole.Touchscreen(displayEl);
    touchscreen.onEach(["touchstart", "touchmove", "touchend"], (e: { state: unknown }) => {
      client.sendTouchState(e.state, true);
    });
  }

  return { mouse, touchscreen };
}
