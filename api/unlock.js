const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../storage')()
const cleanBody = require('./_cleanBody')

module.exports.handler = (event, context, callback) => {
  let parsedBody
  try {
    parsedBody = JSON.parse(event.body || {})
  } catch (e) {
    callback(new Error('[400] Could not parse the body'))
    return
  }

  const body = cleanBody(parsedBody)
  if (!body.githubId) {
    callback(new Error('[400] Missing github ID'))
    return
  }

  const token = parsedBody.token
  let method
  let bailout = false

  storage
    .findOne(body.githubId)
    .then(found => {
      if (found) {
        if (found.valid) {
          callback(new Error('[403] Already unlocked'))
          bailout = true
          return
        }
        method = 'update'
        return
      }
      method = 'create'
    })
    .then(() => {
      if (bailout) { return }
      return stripe.customers.create({
        email: body.email,
        source: token
      })
    })
    .then(customer => {
      if (bailout) { return }
      console.log(customer)
      body.stripeId = customer.id
      return stripe.subscriptions.create({
        customer: customer.id,
        plan: 'kactus-1-month'
      })
    })
    .then(res => {
      if (bailout) { return }
      console.log(res)
      body.valid = true
    })
    .then(() => {
      if (bailout) { return }
      return storage[method](body)
    })
    .then(res => {
      if (bailout) { return }
      callback(null, {
        ok: true,
        message: 'Unlocked full access'
      })
    })
    .catch(callback)
}
