const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../../storage')()
const cleanBody = require('./_cleanBody')
const handleError = require('../_handleError')
const makeCallback = require('../_makeCallback')
const { PLANS } = require('../../constants')

function createNewSubscription (body, parsedBody) {
  // create a new subscription
  return stripe.subscriptions.create({
    customer: body.stripeId,
    plan: body.enterprise ? PLANS.enterprise.month : PLANS.premium.month,
    coupon: parsedBody.coupon || undefined
  })
}

module.exports.handler = (event, context, callback) => {
  let parsedBody
  try {
    parsedBody = JSON.parse(event.body || '{}') || {}
  } catch (e) {
    makeCallback(callback, 'Could not parse the body', 400)
    return
  }

  const body = cleanBody(parsedBody)
  if (!body.githubId) {
    makeCallback(callback, 'Missing github ID', 400)
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
          makeCallback(callback, 'Already unlocked', 403)
          bailout = true
          return
        } else if (body.enterprise && found.validEnterprise) {
          makeCallback(callback, 'Already unlocked', 403)
          bailout = true
          return
        }
        body.orgs = found.orgs
        body.createdAt = found.createdAt
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
          metadata: Object.assign(parsedBody.metadata || {}, {
            githubId: body.githubId,
            login: body.login,
            enterprise: body.enterprise
          })
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
        return Promise.all([
          stripe.subscriptions.list({
            customer: body.stripeId,
            plan: PLANS.premium.month,
            limit: 100
          }),
          stripe.subscriptions.list({
            customer: body.stripeId,
            plan: PLANS.premium.year,
            limit: 100
          })
        ]).then(([monthlySubscriptions, yearlySubscriptions]) => {
          const subscriptionToUpdate = monthlySubscriptions.data.find(s => s.status === 'active') || yearlySubscriptions.data.find(s => s.status === 'active')
          if (!subscriptionToUpdate) {
            return createNewSubscription(body, parsedBody)
          }
          return stripe.subscriptions.update(subscriptionToUpdate.id, {
            plan: PLANS.enterprise[parsedBody.duration || 'month'],
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
        body.valid = false
      } else {
        body.validEnterprise = false
        body.valid = true
      }
    })
    .then(() => {
      if (bailout) { return }
      return storage.update(body)
    })
    .then(res => {
      if (bailout) { return }
      makeCallback(callback, {
        ok: true,
        message: 'Unlocked full access'
      })
    })
    .catch(handleError(callback))
}
