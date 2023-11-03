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
} from "./types";

import { createConnection } from "node:net";

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
    const { host, port } = parseStunURI(uri);

    const header = await buildHeader({
      method: STUNMethod.Binding,
      class: STUNClass.Request,
    });

    const message = buildMessage(header, []);

    const buffer = serialize(message);

    const socket = createSocket({ type: "udp4", reuseAddr: true }, (msg) => {
      try {
        resolve(parseResponse(msg, message));
      } catch (e) {
        reject(e);
      }

      socket.close();
    });

    if (typeof options?.port === "number") {
      socket.bind(options.port);
    }

    socket.on("error", (err) => {
      if (err) {
        reject(err);
      }
    });

    socket.send(buffer, port, host, (err) => {
      if (err) {
        reject(err);
      }
    });
  });
}

function tcpBindingRequest(
  uri: string,
  options?: BindingRequestOptions,
): Promise<STUNMessage> {
  return new Promise<STUNMessage>(async (resolve, reject) => {
    const { host, port } = parseStunURI(uri);

    const header = await buildHeader({
      method: STUNMethod.Binding,
      class: STUNClass.Request,
    });

    const message = buildMessage(header, []);

    const buffer = serialize(message);

    const socket = createConnection(
      { port, host, localPort: options?.port },
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
