const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../../storage')()
const handleError = require('../_handleError')
const makeCallback = require('../_makeCallback')

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

  if (!body.orgId) {
    makeCallback(callback, 'Missing org ID', 400)
    return
  }

  if (!body.token) {
    makeCallback(callback, 'Missing token', 400)
    return
  }

  const token = body.token
  let bailout = false
  let orgId = body.orgId

  let org

  storage
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
      if (!found.stripeId) {
        makeCallback(callback, 'Missing Stripe Id', 404)
        bailout = true
        return
      }
      org = found
    })
    .then(() => {
      if (bailout) { return }
      return stripe.customers.update(org.stripeId, {
        email: body.email,
        source: token,
        metadata: Object.assign(body.metadata || {}, {
          githubId: body.githubId,
          login: body.login,
          org: true,
          orgId: org.id
        })
      })
    })
    .then(() => {
      if (bailout) { return }
      makeCallback(callback, {
        ok: true,
        org: org,
        message: 'Updated card details'
      })
    })
    .catch(handleError(callback))
}
