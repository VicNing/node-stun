import { bind } from "../src/server";

describe("STUN server", () => {
  test("listen to UDP socket", () => {
    bind();
  });
});
