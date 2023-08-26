const {bindingRequest} = require('../dist/index');

async function test() {
  try {
    const message = await bindingRequest('54.197.117.0', 3478);
    console.log(message);
  } catch (e) {
    console.error(e);
  }
}

test();
