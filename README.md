# promiseBackoff

backoff an async task using [iterables](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)

# Installation

```sh
npm i --save promise-backoff
```

# Usage

#### Supports both ESM and CommonJS

```js
// esm
import backoff from 'promise-backoff`
// commonjs
const backoff = require('promise-backoff')
```

#### Example

```js
import backoff from 'promise-backoff'

const opts = {
  // required
  timeouts: [10, 20, 30] // any iterable (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)
  // optional w/ defaults shown
  maxTimeout: Infinity,
  minTimeout: 0,
  jitter: function fullJitter(val) {
    return val * Math.random()
  },
  signal: new AbortController().signal
}
let i = 0
await backoff(opts, async (retry) => {
  try {
    const res = await fetch('https://codeshare.io')
    if (res.status >= 500) {
      // 50X status error, retry if there are attempts left
      return retry(new Error(`status: ${res.status}`))
    }
    return res
  } catch(err) {
    // network error, retry if there are attempts left
    return retry(err)
  }
})
```

# License

MIT
