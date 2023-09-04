const {bindingRequest} = require('../dist/index');

async function test() {
  try {
    // stun1.l.google.com:19302
    const message = await bindingRequest('stun1.l.google.com', 19302);
    console.log(message);
  } catch (e) {
    console.error(e);
  }
}

test();
