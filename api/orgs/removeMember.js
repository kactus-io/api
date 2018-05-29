const stripe = require('stripe')(process.env.STRIPE_SECRET)
const storage = require('../../storage')()
const handleError = require('../_handleError')
const subs = require('./_createOrUpdateSubscription')
const makeCallback = require('../_makeCallback')

/**
 * githubId
 * memberId
 * githubToken
 * orgId
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

  if (!body.memberId) {
    makeCallback(callback, 'Missing member ID', 400)
    return
  }

  if (!body.githubToken) {
    makeCallback(callback, 'Missing github token', 400)
    return
  }

  let bailout = false
  let member
  let org

  Promise.all([
    storage
      .findOne(body.githubId)
      .then(found => {
        if (!found) {
          makeCallback(callback, 'Not a Kactus account', 401)
          bailout = true
        }
      }),
    storage
      .findOne(body.memberId)
      .then(found => {
        if (!found) {
          makeCallback(callback, 'Member is not registered on Kactus', 400)
          bailout = true
          return
        }
        member = found
      })
  ])
    .then(() => {
      if (bailout) { return }
      return storage
        .findOneOrg(body.orgId)
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
          if (found.members.indexOf(body.memberId) === -1) {
            makeCallback(callback, 'Trying to remove a member that is not part of the org', 400)
            bailout = true
            return
          }
          if (!found.stripeId || (!found.valid && !found.validEnterprise)) {
            makeCallback(callback, 'The organization is locked', 401)
            bailout = true
            return
          }
          org = found
        })
    })
    .then(() => {
      if (bailout) { return }
      // need to update the existing subscription
      return subs.updateSubscription(stripe, {
        org,
        fromPlan: org.validEnterprise ? 'enterprise' : 'premium',
        toPlan: org.validEnterprise ? 'enterprise' : 'premium',
        members: org.members.length - 1
      })
    })
    .then(() => {
      if (bailout) { return }
      return storage.removeUserFromOrg(org, member)
    })
    .then(() => {
      if (bailout) { return }
      makeCallback(callback, {
        ok: true,
        message: 'Removed full access'
      })
    })
    .catch(handleError(callback))
}
