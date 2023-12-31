# stunman

`stunman` is a zero-runtime-dependency node.js library written in Typescript that implements Session Traversal Utilities for
NAT (STUN) protocol.

**Currently under heavy constructon.**

## Implemented Protocols

- [Session Traversal Utilities for NAT (STUN) (RFC 8489)](https://datatracker.ietf.org/doc/html/rfc8489)

## Features

- STUN client with UDP, IPv4 support

## Usage

```typescript
import { bindingRequest } from "stunman/client";
//or const { bindingRequest } = require('stunman');

bindingRequest();
```

## Roadmap

- [x] STUN URI parsing
- [x] Basic TCP support
- [ ] UDP retransmission
- [ ] STUN server implementation
- [ ] DTLS support
- [ ] IPv6 support
