'use strict'

const HyperId = require('hyperid')
const Parse = require('fast-json-parse')
const Stringify = require('fast-safe-stringify')
const Pino = require('pino')
const Boot = require('boot-in-the-arse')
const Queue = require('fastq')
const amqp = require('amqplib/callback_api')
const Joi = require('joi')

const defaults = {
  tag: 'untagged',
  schema: {},
  rabbit: {
    url: 'amqp://rabbitmq:rabbitmq@localhost',
    maxRetries: 10
  }
}

const Qwen = module.exports = function (opts) {
  if (!(this instanceof Qwen)) {
    return new Qwen(opts)
  }

  function worker (subscriber, done) {
    subscriber(done)
  }

  this.id = HyperId().uuid
  this.opts = Object.assign({}, defaults, opts)
  this.log = Pino()
  this.bootloader = Boot(this)
  this.subscribers = Queue(this, worker, 1)
  this.subscribers.pause()
}

Qwen.prototype.subscribe = function (params, handler) {
  var exchange = params.exc
  var key = params.key
  var qwen = this

  function subscriber (done) {
    qwen.channel.assertExchange(exchange, 'direct', {durable: true}, (err) => {
      if (err) return done(err)
      var q = qwen.channel.assertQueue('', {})
      qwen.channel.bindQueue(q.queue, exchange, key)
      qwen.channel.consume(q.queue, (msg) => {
        qwen.log.info({info: 'Message received', message: logMessage(msg)})

        parseMessage(msg, (err, parsedMessage) => {
          if (err) {
            qwen.log.error({error: `Invalid JSON message, parsing error: ${Stringify(err)}`, message: logMessage(msg)})
            return qwen.channel.ack(msg)
          }

          // first try to validate the input message
          validateMessage(parsedMessage, err => {
            if (err) {
              qwen.log.error({error: `Error validating message, ${Stringify(err)}`, message: logMessage(msg)})
              return qwen.channel.ack(msg)
            }
            handler(qwen, parsedMessage, (err) => {
              if (err) {
                qwen.log.error({error: `Error precessing message, ${Stringify(err)}`, message: logMessage(msg)})
                return qwen.channel.ack(msg)
              }
              qwen.log.info({info: 'End processing message', message: logMessage(msg)})
              qwen.channel.ack(msg)
            })
          })
        })
      })
      done()
    })
  }
  this.subscribers.push(subscriber)
  return this
}

function validateMessage (msg, done) {
  const schema = this.opts.schema
  const exc = msg.fields.exchange
  const key = msg.fields.routingKey
  const content = msg.content

  // note: validation is optional.
  if (schema[exc] && schema[exc][key]) {
    Joi.validate(content, (schema[exc][key]), done)
  } else {
    done()
  }
}

Qwen.prototype.publish = function (exchange, key, msg, options) {
  var channel = this.channel
  options = Object.assign({}, options || {}, {messageId: HyperId().uuid})
  channel.assertExchange(exchange, 'direct', {durable: true}, () => {
    channel.publish(exchange, key, Buffer.from(Stringify(msg)), options)
    this.log.info({info: 'Message published', message: {exchange: exchange, key: key}})
  })

  return this
}

Qwen.prototype.start = function (done) {
  this.ready(() => {
    var retry = 0

    var timer = setInterval(() => {
      retry++
      connect(this, (err) => {
        if (err) {
          if (retry <= this.opts.rabbit.maxRetries) {
            return this.log.error({error: 'AMQP connect failed', retry: retry})
          }
          clearInterval(timer)
          done(err)
        }
        clearInterval(timer)
        done()
      })
    }, 1000)
  })
}

function connect (qwen, done) {
  amqp.connect(qwen.opts.rabbit.url, (err, connection) => {
    if (err) {
      return done(err)
    }
    qwen.log.info({info: 'AMQP connect successful', options: qwen.opts})
    qwen.connection = connection
    qwen.connection.createChannel((err, channel) => {
      if (err) {
        qwen.log.error({info: 'couldn\'t open AMQP channel', options: qwen.opts})
        return done(err)
      }
      qwen.log.info({info: 'AMQP channel opened'})
      qwen.channel = channel
      qwen.subscribers.resume()
      qwen.subscribers.drain = () => {
        done()
      }
    })
  })
}

function parseMessage (msg, done) {
  const content = msg.content.toString()
  const parsed = Parse(content)

  if (parsed.err) {
    return done(parsed.err)
  }

  const wrapped = {
    fields: msg.fields,
    properties: msg.properties,
    content: parsed.value
  }

  done(null, wrapped)
}

function logMessage (msg) {
  return {
    messageId: msg.properties.messageId,
    correlationId: msg.properties.correlationId || 'N/A',
    exchange: msg.fields.exchange,
    routingKey: msg.fields.routingKey
  }
}
