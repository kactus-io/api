const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../storage')()
const cleanBody = require('./_cleanBody')

function createNewSubscription (body, parsedBody) {
  // create a new subscription
  return stripe.subscriptions.create({
    customer: body.stripeId,
    plan: body.enterprise ? 'kactus-enterprise-1-month' : 'kactus-1-month',
    coupon: parsedBody.coupon || undefined
  })
}

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
        if (!body.enterprise && (found.valid || found.validEnterprise)) {
          callback(new Error('[403] Already unlocked'))
          bailout = true
          return
        } else if (body.enterprise && found.validEnterprise) {
          callback(new Error('[403] Already unlocked'))
          bailout = true
          return
        }
        body.stripeId = found.stripeId
        body.valid = found.valid
        body.validEnterprise = found.validEnterprise
        method = 'update'
        return
      }
      method = 'create'
    })
    .then(() => {
      if (bailout) { return }
      if (!body.stripeId) {
        return stripe.customers.create({
          email: body.email,
          source: token,
          metadata: {
            githubId: body.githubId,
            login: body.login,
            enterprise: body.enterprise
          }
        }).then(customer => {
          console.log(customer)
          body.stripeId = customer.id
          return storage[method](body)
        })
      } else {
        return stripe.customers.update(body.stripeId, {
          email: body.email,
          source: token,
          metadata: {
            githubId: body.githubId,
            login: body.login,
            enterprise: body.enterprise
          }
        })
      }
    })
    .then(() => {
      if (bailout) { return }
      if (body.stripeId && body.valid && body.enterprise) {
        // need to update the existing subscription
        return stripe.subscriptions.list({
          customer: body.stripeId,
          plam: 'kactus-1-month',
          limit: 100
        }).then((subscriptions) => {
          const subscriptionToUpdate = subscriptions.data.find(s => s.status === 'active')
          if (!subscriptionToUpdate) {
            return createNewSubscription(body, parsedBody)
          }
          return stripe.subscriptions.update(subscriptionToUpdate.id, {
            plan: 'kactus-enterprise-1-month',
            coupon: parsedBody.coupon || undefined
          })
        })
      }
      // create a new subscription
      return createNewSubscription(body, parsedBody)
    })
    .then(res => {
      if (bailout) { return }
      console.log(res)
      if (body.enterprise) {
        body.validEnterprise = true
      } else {
        body.valid = true
      }
    })
    .then(() => {
      if (bailout) { return }
      return storage.update(body)
    })
    .then(res => {
      if (bailout) { return }
      callback(null, {
        ok: true,
        message: 'Unlocked full access'
      })
    })
    .catch((err) => {
      console.error(err)
      if (!err.type) {
        return callback(err)
      }
      switch (err.type) {
        case 'StripeCardError':
          // A declined card error
          const message = err.message // => e.g. "Your card's expiration year is invalid."
          callback(new Error(`[400] ${message}`))
          break
        case 'RateLimitError':
          // Too many requests made to the API too quickly
          callback(new Error(`[503] Server is a bit overloaded, try again in a bit`))
          break
        case 'StripeInvalidRequestError':
          // Invalid parameters were supplied to Stripe's API
          callback(new Error(`[400] Bad request`))
          break
        case 'StripeAPIError':
          // An error occurred internally with Stripe's API
          callback(new Error(`[500] Stripe failed, sorry about that`))
          break
        case 'StripeConnectionError':
          // Some kind of error occurred during the HTTPS communication
          callback(new Error(`[500] Stripe is down, sorry about that`))
          break
        case 'StripeAuthenticationError':
          // You probably used an incorrect API key
          callback(new Error(`[500] How did that happen!?`))
          break
        default:
          // Handle any other types of unexpected errors
          callback(err)
          break
      }
    })
}
