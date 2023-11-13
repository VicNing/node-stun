import { createSocket } from "node:dgram";
import {
  buildHeader,
  buildMessage,
  parseResponse,
  parseStunURI,
  serialize,
} from "./common";

import {
  STUNClass,
  STUNMethod,
  STUNMessage,
  BindingRequestOptions,
  UDPTransmitOptions,
} from "./types";

import { createConnection } from "node:net";
import { UDPRequester } from "./udp_requester";

export async function bindingRequest(
  uri: string,
  options?: BindingRequestOptions,
): Promise<STUNMessage> {
  if (options?.socketType === "tcp") {
    return tcpBindingRequest(uri, options);
  } else {
    return udpBindingRequest(uri, options);
  }
}

function udpBindingRequest(
  uri: string,
  options?: BindingRequestOptions,
): Promise<STUNMessage> {
  return new Promise<STUNMessage>(async (resolve, reject) => {
    const { address, port } = parseStunURI(uri);

    const header = await buildHeader({
      method: STUNMethod.Binding,
      class: STUNClass.Request,
    });

    const message = buildMessage(header, []);

    const buffer = serialize(message);

    const requester = new UDPRequester({
      maxRetransmitCount: options?.maxRetransmitCount,
      maxRetransmitRTOFactor: options?.maxRetransmitRTOFactor,
      localPort: options?.port,
    });

    try {
      const response = await requester.request(buffer, address, port);
      resolve(parseResponse(response, message));
    } catch (e) {
      reject(e);
    }
  });
}

function tcpBindingRequest(
  uri: string,
  options?: BindingRequestOptions,
): Promise<STUNMessage> {
  return new Promise<STUNMessage>(async (resolve, reject) => {
    const { address, port } = parseStunURI(uri);

    const header = await buildHeader({
      method: STUNMethod.Binding,
      class: STUNClass.Request,
    });

    const message = buildMessage(header, []);

    const buffer = serialize(message);

    const socket = createConnection(
      { port, host: address, localPort: options?.port },
      () => {
        socket.write(buffer);
      },
    );

    socket.on("data", (buffer) => {
      try {
        const response = parseResponse(buffer, message);

        socket.end(() => {
          socket.destroy();
          resolve(response);
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}
