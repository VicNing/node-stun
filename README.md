# stunman

`stunman` is a zero-dependency node.js library written in Typescript that implements Session Traversal Utilities for
NAT (STUN) protocol.

## Implemented Protocols

- [Session Traversal Utilities for NAT (STUN) (RFC 8489)](https://datatracker.ietf.org/doc/html/rfc8489)

## Features

- STUN client with UDP, IPv4 support

## Usage

```typescript
import {bindingRequest} from "stunman";
//or const { bindingRequest } = require('stunman');

bindingRequest();
```

## Roadmap

- [] TCP support
- [] STUN server
- 
