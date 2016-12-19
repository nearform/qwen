# qwen
A simple abstraction around AMQP to hide away the icky bits.

## Install
To install, simply use npm...

```sh
npm install qwen
```

### Testing, linting, & coverage
This module can be tested and reported on in a variety of ways...
```sh
npm run test        # runs TAP based unit test suite.
npm run integration # runs TAP based integration suite.
npm run coverage    # generates and opens a coverage report.
npm run lint        # lints via standardJS.
npm run validate    # runs test, integration, and lint.
```
__Note:__ `integration` and `validate` require a valid `.env` file. Details on how to create this are below.

## Quick Example
```js
'use strict'

const Config = require('./config')
const Qwen = require('qwen')

const qwen = Qwen(Config.qwen)
  .use(require('./service-one'), Config.serviceOne)
  .use(require('./service-two'), Config.serviceTwo)
  .use(require('./service-three'), Config.serviceThree)

  .start((err) => {
    if (!err) {
      qwen.log.error(err)
      process.exit(1)
    }
    
    qwen.info.log('server started')
  })
```

## Options
```js
{
  // A tag that can be used to identify and group services
  tag: 'untagged',
  
  // Options for rabbitmq.
  rabbit: {
    
    // The url to connect to.
    url: 'amqp://rabbitmq:rabbitmq@localhost',
    
    // The max number of attempts to connect before failing.
    maxRetries: 10
  }
}
```

# License
Copyright nearForm 2016. Licensed under [MIT][License]

[License]: ./LICENSE.md 
