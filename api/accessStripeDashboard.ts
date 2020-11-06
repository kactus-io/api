import { _handler } from '../_handler'
import { findOne, findOneOrg } from '../storage'
import { BadRequest, Unauthorized, Forbidden, NotFound } from './errors'
import { stripe } from '../stripe'

/**
 * githubId
 * memberUsername
 * githubToken
 * orgId
 */
export const handler = _handler(async event => {
  let body = JSON.parse(event.body)

  if (!body.githubId) {
    throw new BadRequest('Missing github ID')
  }

  if (!body.orgId) {
    throw new BadRequest('Missing org ID')
  }

  if (!body.githubToken) {
    throw new BadRequest('Missing github token')
  }

  const [user, org] = await Promise.all([
    findOne(body.githubId).then(found => {
      if (!found) {
        throw new Unauthorized('Not a Kactus account')
      }
      return found
    }),
    findOneOrg(body.orgId),
  ])

  if (!org && body.orgId) {
    throw new NotFound('Trying to access an org that does not exist')
  }
  if (org && org.admins.indexOf(body.githubId) === -1) {
    throw new NotFound('Trying to unlock an org that does not exist')
  }

  if (org && org.stripeId) {
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeId,
      return_url: 'https://kactus.io/org',
    })

    return {
      ok: true,
      url: session.url,
    }
  }

  if (!org && user.stripeId) {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeId,
      return_url: 'https://kactus.io/account',
    })

    return {
      ok: true,
      url: session.url,
    }
  }

  throw new Forbidden('The resource is locked')
})
