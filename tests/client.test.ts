import { parseStunURI } from "../src/common";
import { bindingRequest } from "../src/client";
import {
  AttributeType,
  STUNClass,
  STUNMethod,
  XORMappedAddress,
} from "../src/types";

describe("STUN binding request", () => {
  test.only("basic binding request should success", async () => {
    const response = await bindingRequest("stun:stun1.l.google.com:19302");
    // const response = await bindingRequest("stun:localhost:3478");
    console.log(response);

    expect(response.header.method).toBe(STUNMethod.Binding);
    expect(response.header.class).toBe(STUNClass.SuccessResponse);
    expect(response.attributes.length).toBeGreaterThan(0);
    expect(
      response.attributes.some(
        (attribute) => attribute.type === AttributeType.XOR_MAPPED_ADDRESS,
      ),
    ).toBe(true);
  });

  test("binding on the same local port should receive same port from responses", async () => {
    const responseA = await bindingRequest("stun:stun1.l.google.com:19302", {
      port: 3478,
    });
    const responseB = await bindingRequest("stun:stun1.l.google.com:19302", {
      port: 3478,
    });

    const xorMappedAddressAttributeA = responseA.attributes.find(
      (attribute) => attribute.type === AttributeType.XOR_MAPPED_ADDRESS,
    ) as XORMappedAddress;
    const xorMappedAddressAttributeB = responseB.attributes.find(
      (attribute) => attribute.type === AttributeType.XOR_MAPPED_ADDRESS,
    ) as XORMappedAddress;

    expect(xorMappedAddressAttributeA.port).toBe(
      xorMappedAddressAttributeB.port,
    );
  });

  test("binding to a TCP stun server", async () => {
    const response = await bindingRequest("stun:stun.linuxtrent.it:3478", {
      socketType: "tcp",
    });
    console.log(response);
    expect(response).not.toBeUndefined();
  });
});

describe("STUN URI", () => {
  test("parsing 'stun:<host>[:port]' scheme uri with host and port", () => {
    const { host, port } = parseStunURI("stun:foo:1234");

    expect(host).toBe("foo");
    expect(port).toBe(1234);
  });

  test("parsing 'stun:<host>' should yield default port 3478", () => {
    const { host, port } = parseStunURI("stun:foo");

    expect(host).toBe("foo");
    expect(port).toBe(3478);
  });

  test.skip("parsing 'stun:<host>:' should throw", () => {
    //todo
    expect(() => parseStunURI("stun:foo:")).toThrow();
  });
});
