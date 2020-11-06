import { _handler } from '../../_handler'
import { findOneOrg } from '../../storage'
import { BadRequest, NotFound } from '../errors'
import { stripe } from '../../stripe'

/**
 * githubId
 * token
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

  if (!body.token) {
    throw new BadRequest('Missing token')
  }

  const token = body.token
  let orgId = body.orgId

  const org = await findOneOrg(orgId)

  if (!org) {
    throw new NotFound('Trying to unlock an org that does not exist')
  }
  if (org.admins.indexOf(body.githubId) === -1) {
    throw new NotFound('Trying to unlock an org that does not exist')
  }
  if (!org.stripeId) {
    throw new BadRequest('Missing Stripe Id')
  }

  await stripe.customers.update(org.stripeId, {
    email: body.email,
    source: token,
    metadata: Object.assign(body.metadata || {}, {
      githubId: body.githubId,
      login: body.login,
      org: true,
      orgId: org.id,
    }),
  })

  return {
    ok: true,
    org: org,
    message: 'Updated card details',
  }
})
