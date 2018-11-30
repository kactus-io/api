const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../../storage')()
const handleError = require('../_handleError')
const makeCallback = require('../_makeCallback')
const uuid = require('uuid/v4')
const subs = require('./_createOrUpdateSubscription')
const {cancel} = require('../users/unsubscribe')

function createOrUpdateStripeCustomer (org, body, token, method) {
  if (org.stripeId) {
    return stripe.customers.update(body.stripeId, {
      email: body.email,
      source: token,
      metadata: Object.assign(body.metadata || {}, {
        githubId: body.githubId,
        login: body.login,
        org: true,
        orgId: org.id
      })
    })
  } else {
    return stripe.customers.create({
      email: body.email,
      source: token,
      metadata: Object.assign(body.metadata || {}, {
        githubId: body.githubId,
        login: body.login,
        org: true,
        orgId: org.id
      })
    }).then(customer => {
      console.log(customer)
      org.stripeId = customer.id
      return storage[method](org)
    })
  }
}

/**
 * githubId
 * token
 * orgId
 * enterprise
 */
module.exports.handler = (event, context, callback) => {
  let body
  try {
    body = JSON.parse(event.body || '{}') || {}
  } catch (e) {
    makeCallback(callback, 'Could not parse the body', 400)
    return
  }

  if (!body.githubId) {
    makeCallback(callback, 'Missing github ID', 400)
    return
  }

  if (!body.token) {
    makeCallback(callback, 'Missing token', 400)
    return
  }

  const token = body.token
  let bailout = false
  let orgId = body.orgId
  const method = orgId ? 'updateOrg' : 'createOrg'
  let user

  let org

  storage
    .findOne(body.githubId)
    .then(found => {
      if (!found) {
        makeCallback(callback, 'Not a Kactus account', 401)
        bailout = true
        return
      }
      user = found
    })
    .then(() => {
      if (bailout) { return }
      if (!orgId) {
        // if we don't have a orgId, it means that we want to create one
        orgId = uuid()
        org = {
          id: uuid(),
          members: [],
          admins: [String(body.githubId)]
        }
        // if the user already has a subscription, cancel it first
        if (user.stripeId && (user.valid || user.validEnterprise)) {
          return cancel(user, false)
        }
      } else {
        return storage
          .findOneOrg(orgId)
          .then(found => {
            if (!found) {
              makeCallback(callback, 'Trying to unlock an org that does not exist', 404)
              bailout = true
              return
            }
            if (found.admins.indexOf(body.githubId) === -1) {
              makeCallback(callback, 'Trying to unlock an org that does not exist', 404)
              bailout = true
              return
            }
            if (!body.enterprise && (found.valid || found.validEnterprise)) {
              makeCallback(callback, 'Already unlocked', 403)
              bailout = true
              return
            } else if (body.enterprise && found.validEnterprise) {
              makeCallback(callback, 'Already unlocked', 403)
              bailout = true
              return
            }
            org = found
          })
      }
    })
    .then(() => {
      if (bailout) { return }
      return createOrUpdateStripeCustomer(org, body, token, method)
    })
    .then(() => {
      if (bailout) { return }
      if (org.stripeId && org.valid && body.enterprise) {
        // need to update the subscription
        return subs.updateSubscription(stripe, {
          org,
          fromPlan: 'premium',
          toPlan: 'enterprise',
          members: org.members.length,
          coupon: body.coupon,
          duration: body.duration
        })
      }
      // create a new subscription
      return subs.createNewSubscription(stripe, {
        org,
        plan: body.enterprise ? 'enterprise' : 'premium',
        members: 1,
        coupon: body.coupon,
        duration: body.duration
      })
    })
    .then(res => {
      if (bailout) { return }
      console.log(res)
      org.validEnterprise = body.enterprise
      org.valid = !body.enterprise
      return storage.updateOrg(org).then(() => {
        if (method === 'createOrg') {
          return storage.addUserToOrg(org, user)
        }
      })
    })
    .then(() => {
      if (bailout) { return }
      makeCallback(callback, {
        ok: true,
        org: org,
        message: 'Unlocked full access'
      })
    })
    .catch(handleError(callback))
}
